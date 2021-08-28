const MuleToken = artifacts.require('MuleToken');
const StateChannel = artifacts.require('StateChannel');
const TruDaMul = artifacts.require('TruDaMul');

contract('PaymentsChannel', async (accounts) => {
  const owner = accounts[0];
  const sender = accounts[1];
  const mule = accounts[2];
  const proxy = accounts[3];
  const mule2 = accounts[4];

  let blockNumber;
  let blockNumber2;
  const exID = web3.utils.asciiToHex('0001');
  const pURI = web3.utils.asciiToHex('ImmutableURI');

  it('releases tokens to the accounts', async () => {
    const token = await MuleToken.deployed();
    let balance = await token.balanceOf.call(sender);
    assert.equal(balance.toString(), '0');

    await token.transfer(sender, 20000, {
      from: owner,
    });
    balance = await token.balanceOf.call(sender);
    assert.equal(
      balance.toString(),
      '20000',
      'Amount was not correctly minted'
    );

    await token.transfer(mule, 10000, {
      from: owner,
    });
    balance = await token.balanceOf.call(mule);
    assert.equal(
      balance.toString(),
      '10000',
      'Amount was not correctly minted'
    );
  });

  it('opens a channel between sender and the two mules', async () => {
    const token = await MuleToken.deployed();
    const channel = await StateChannel.deployed();

    await token.approve(StateChannel.address, 10000, {
      from: sender,
    });
    const result = await channel.createChannel(mule, 5000, {
      from: sender,
    });
    blockNumber = result.receipt.blockNumber;
    const result2 = await channel.createChannel(mule2, 5000, {
      from: sender,
    });
    blockNumber2 = result2.receipt.blockNumber;
  });

  it('mule sumbits a new tender', async () => {
    const token = await MuleToken.deployed();
    const trudamul = await TruDaMul.deployed();

    const tenderHash = web3.utils.soliditySha3(
      {
        type: 'bytes',
        value: exID,
      },
      {
        type: 'uint256',
        value: 100,
      },
      {
        type: 'uint256',
        value: 1,
      },
      {
        type: 'bytes',
        value: pURI,
      }
    );
    let senderTenderSignature = await web3.eth.sign(tenderHash, sender);
    senderTenderSignature =
      senderTenderSignature.substr(0, 130) +
      (senderTenderSignature.substr(130) == '00' ? '1b' : '1c');

    const muleHash = web3.utils.soliditySha3({
      type: 'address',
      value: mule,
    });
    let senderMuleSignature = await web3.eth.sign(muleHash, sender);
    senderMuleSignature =
      senderMuleSignature.substr(0, 130) +
      (senderMuleSignature.substr(130) == '00' ? '1b' : '1c');

    await token.transfer(TruDaMul.address, 10, {
      from: sender,
    });

    const res = await trudamul.submitTender(
      exID,
      100,
      1,
      pURI,
      senderTenderSignature,
      mule,
      senderMuleSignature,
      mule,
      {
        from: mule,
      }
    );
  });

  it('proxy sumbits a new tender', async () => {
    const token = await MuleToken.deployed();
    const trudamul = await TruDaMul.deployed();

    const tenderHash = web3.utils.soliditySha3(
      {
        type: 'bytes',
        value: exID,
      },
      {
        type: 'uint256',
        value: 100,
      },
      {
        type: 'uint256',
        value: 1,
      },
      {
        type: 'bytes',
        value: pURI,
      }
    );
    let senderTenderSignature = await web3.eth.sign(tenderHash, sender);
    senderTenderSignature =
      senderTenderSignature.substr(0, 130) +
      (senderTenderSignature.substr(130) == '00' ? '1b' : '1c');

    const muleHash = web3.utils.soliditySha3({
      type: 'address',
      value: mule,
    });
    let senderMuleSignature = await web3.eth.sign(muleHash, sender);
    senderMuleSignature =
      senderMuleSignature.substr(0, 130) +
      (senderMuleSignature.substr(130) == '00' ? '1b' : '1c');

    await token.transfer(TruDaMul.address, 200, {
      from: sender,
    });

    const res = await trudamul.submitTender(
      exID,
      100,
      1,
      pURI,
      senderTenderSignature,
      mule,
      senderMuleSignature,
      proxy,
      {
        from: proxy,
      }
    );
    console.log('Gas submitTender: ', res.receipt.gasUsed);

    const res2 = await trudamul.checkPermissions(proxy, exID, { from: proxy });
  });

  it('mule closes a channel', async () => {
    const channel = await StateChannel.deployed();
    const trudamul = await TruDaMul.deployed();
    const balance = 1300;

    const receiverHash = web3.utils.soliditySha3(
      {
        type: 'address',
        value: sender,
      },
      {
        type: 'uint32',
        value: blockNumber,
      },
      {
        type: 'uint192',
        value: balance,
      },
      {
        type: 'address',
        value: StateChannel.address,
      }
    );
    let receiverSign = await web3.eth.sign(receiverHash, mule);
    receiverSign =
      receiverSign.substr(0, 130) +
      (receiverSign.substr(130) == '00' ? '1b' : '1c');

    const senderHash = web3.utils.soliditySha3(
      {
        type: 'address',
        value: mule,
      },
      {
        type: 'uint32',
        value: blockNumber,
      },
      {
        type: 'uint192',
        value: balance,
      },
      {
        type: 'address',
        value: StateChannel.address,
      }
    );
    let senderSign = await web3.eth.sign(senderHash, sender);
    senderSign =
      senderSign.substr(0, 130) +
      (senderSign.substr(130) == '00' ? '1b' : '1c');

    const res = await channel.closeChannel(
      mule,
      blockNumber,
      balance,
      senderSign,
      receiverSign,
      exID,
      TruDaMul.address,
      {
        from: mule,
      }
    );

    console.log('Gas closeChannel: ', res.receipt.gasUsed);
  });

  it('mule2 sumbits payments', async () => {
    const token = await MuleToken.deployed();
    const trudamul = await TruDaMul.deployed();
    const pPayID = web3.utils.asciiToHex('0002');

    const paymentsHash = web3.utils.soliditySha3(
      {
        type: 'bytes',
        value: exID,
      },
      {
        type: 'address',
        value: mule2,
      },
      {
        type: 'bytes',
        value: pPayID,
      }
    );
    let senderPaymentsSignature = await web3.eth.sign(paymentsHash, sender);
    senderPaymentsSignature =
      senderPaymentsSignature.substr(0, 130) +
      (senderPaymentsSignature.substr(130) == '00' ? '1b' : '1c');

    const res = await trudamul.submitPayment(
      exID,
      mule2,
      pPayID,
      senderPaymentsSignature,
      {
        from: mule2,
      }
    );

    console.log('Gas submitPayment: ', res.receipt.gasUsed);
  });

  it('mule2 closes a channel', async () => {
    const channel = await StateChannel.deployed();
    const trudamul = await TruDaMul.deployed();
    const balance = 1300;

    const receiverHash = web3.utils.soliditySha3(
      {
        type: 'address',
        value: sender,
      },
      {
        type: 'uint32',
        value: blockNumber2,
      },
      {
        type: 'uint192',
        value: balance,
      },
      {
        type: 'address',
        value: StateChannel.address,
      }
    );
    let receiverSign = await web3.eth.sign(receiverHash, mule2);
    receiverSign =
      receiverSign.substr(0, 130) +
      (receiverSign.substr(130) == '00' ? '1b' : '1c');

    const senderHash = web3.utils.soliditySha3(
      {
        type: 'address',
        value: mule2,
      },
      {
        type: 'uint32',
        value: blockNumber2,
      },
      {
        type: 'uint192',
        value: balance,
      },
      {
        type: 'address',
        value: StateChannel.address,
      }
    );
    let senderSign = await web3.eth.sign(senderHash, sender);
    senderSign =
      senderSign.substr(0, 130) +
      (senderSign.substr(130) == '00' ? '1b' : '1c');

    await channel.closeChannel(
      mule2,
      blockNumber2,
      balance,
      senderSign,
      receiverSign,
      exID,
      TruDaMul.address,
      {
        from: mule2,
      }
    );
  });
});

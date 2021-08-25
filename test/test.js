const MuleToken = artifacts.require('MuleToken');
const StateChannel = artifacts.require('StateChannel');
const TruDaMul = artifacts.require('TruDaMul');

contract('PaymentsChannel', async (accounts) => {
  const owner = accounts[0];
  const sender = accounts[1];
  const mule = accounts[2];

  let blockNumber;
  const eID = web3.utils.asciiToHex('0001');
  const pURI = web3.utils.asciiToHex('ImmutableURI');

  it('releases tokens to the accounts', async () => {
    const token = await MuleToken.deployed();
    let balance = await token.balanceOf.call(sender);
    assert.equal(balance.toString(), '0');

    await token.transfer(sender, 10000, {
      from: owner,
    });
    balance = await token.balanceOf.call(sender);
    assert.equal(
      balance.toString(),
      '10000',
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

  it('opens a channel between sender and mule', async () => {
    const token = await MuleToken.deployed();
    const channel = await StateChannel.deployed();

    await token.approve(StateChannel.address, 5000, {
      from: sender,
    });
    const result = await channel.createChannel(mule, 5000, {
      from: sender,
    });
    blockNumber = result.receipt.blockNumber;
  });

  it('announce a new tender', async () => {
    const token = await MuleToken.deployed();
    const trudamul = await TruDaMul.deployed();

    const tenderHash = web3.utils.soliditySha3(
      {
        type: 'bytes',
        value: eID,
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
    let senderSignature = await web3.eth.sign(tenderHash, sender);
    senderSignature =
      senderSignature.substr(0, 130) +
      (senderSignature.substr(130) == '00' ? '1b' : '1c');

    await token.transfer(TruDaMul.address, 200, {
      from: sender,
    });

    const res = await trudamul.muleTenderAnnouncement(
      eID,
      100,
      1,
      pURI,
      senderSignature,
      10,
      {
        from: mule,
      }
    );
  });

  it('closes a channel', async () => {
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

    await trudamul.setPaidTemp(mule, eID);

    await channel.closeChannel(
      mule,
      blockNumber,
      balance,
      senderSign,
      receiverSign,
      eID,
      TruDaMul.address,
      {
        from: mule,
      }
    );
  });
});

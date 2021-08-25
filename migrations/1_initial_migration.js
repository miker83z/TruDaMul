const MuleToken = artifacts.require('MuleToken');
const StateChannel = artifacts.require('StateChannel');
const TruDaMul = artifacts.require('TruDaMul');

module.exports = async (deployer, something, accounts) => {
  await deployer.deploy(MuleToken);
  const token = await MuleToken.deployed();
  await deployer.deploy(TruDaMul, token.address, accounts[1]);
  const trudamul = await TruDaMul.deployed();
  await deployer.deploy(StateChannel, token.address);
};

const ENS = artifacts.require('./registry/ENSRegistry.sol')
const PublicResolver = artifacts.require('DiamondResolver.sol')
const EAS = artifacts.require('EAS.sol')
const SchemaRegistry = artifacts.require('SchemaRegistry.sol')
const OptiDomainsAttestationFacet = artifacts.require('OptiDomainsAttestationFacet.sol')
const OptiDomainsAttestationDiamond = artifacts.require('OptiDomainsAttestationDiamond.sol')
const NameWrapperRegistry = artifacts.require('NameWrapperRegistry.sol')
const NameWrapper = artifacts.require('MockNameWrapper.sol')
const RegistryWhitelistAuthFacet = artifacts.require('RegistryWhitelistAuthFacet.sol')
const OptiDomainsSocialOracle = artifacts.require('OptiDomainsSocialOracle.sol')
const OptiDomainsSocialOracleFacet = artifacts.require('OptiDomainsSocialOracleFacet.sol')
const PublicResolverFacet = artifacts.require('PublicResolverFacet.sol')
const TestAddrResolver = artifacts.require('TestAddrResolver.sol')
const TestWeirdResolver = artifacts.require('TestWeirdResolver.sol')
const { deploy } = require('../test-utils/contracts')
const { labelhash } = require('../test-utils/ens')
const {
  EMPTY_BYTES32: ROOT_NODE,
  EMPTY_ADDRESS,
} = require('../test-utils/constants')

const { expect } = require('chai')
const namehash = require('eth-ens-namehash')
const sha3 = require('web3-utils').sha3

const { exceptions } = require('../test-utils')
const { ethers } = require('hardhat')
const crypto = require('crypto')

async function deployWhitelistAuthFacet(_diamondResolver) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const auth = await RegistryWhitelistAuthFacet.new();

  const selectors = [
    ethers.utils.id("isAuthorised(address,bytes32)").substring(0, 10),
    ethers.utils.id("setWhitelisted(address,bool)").substring(0, 10),
  ]

  const facetCut = {
    target: auth.address,
    action: 0, // ADD
    selectors: selectors
  }

  const supportInterfaces = [
    "0x25f36704", // IDiamondResolverAuth
  ]

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    // "0x0000000000000000000000000000000000000000",
    diamondResolver.address, 
    // "0x",
    diamondResolver.interface.encodeFunctionData(
      "setMultiSupportsInterface",
      [
        supportInterfaces,
        true,
      ]
    ),
  )

  await tx1.wait()

  return await RegistryWhitelistAuthFacet.at(diamondResolver.address)
}

async function deployPublicResolverFacet(_diamondResolver) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const publicResolver = await PublicResolverFacet.new();

  const selectors = [
    ethers.utils.id("ABI(bytes32,uint256)").substring(0, 10),
    ethers.utils.id("addr(bytes32)").substring(0, 10),
    ethers.utils.id("addr(bytes32,uint256)").substring(0, 10),
    ethers.utils.id("contenthash(bytes32)").substring(0, 10),
    ethers.utils.id("dnsRecord(bytes32,bytes32,uint16)").substring(0, 10),
    ethers.utils.id("hasDNSRecords(bytes32,bytes32)").substring(0, 10),
    ethers.utils.id("interfaceImplementer(bytes32,bytes4)").substring(0, 10),
    ethers.utils.id("name(bytes32)").substring(0, 10),
    ethers.utils.id("pubkey(bytes32)").substring(0, 10),
    ethers.utils.id("setABI(bytes32,uint256,bytes)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,uint256,bytes)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,address)").substring(0, 10),
    ethers.utils.id("setAddrWithRef(bytes32,uint256,bytes32,bytes)").substring(0, 10),
    ethers.utils.id("setContenthash(bytes32,bytes)").substring(0, 10),
    ethers.utils.id("setDNSRecords(bytes32,bytes)").substring(0, 10),
    ethers.utils.id("setInterface(bytes32,bytes4,address)").substring(0, 10),
    ethers.utils.id("setName(bytes32,string)").substring(0, 10),
    ethers.utils.id("setPubkey(bytes32,bytes32,bytes32)").substring(0, 10),
    ethers.utils.id("setText(bytes32,string,string)").substring(0, 10),
    ethers.utils.id("setTextWithRef(bytes32,bytes32,string,string)").substring(0, 10),
    ethers.utils.id("setZonehash(bytes32,bytes)").substring(0, 10),
    ethers.utils.id("text(bytes32,string)").substring(0, 10),
    ethers.utils.id("zonehash(bytes32)").substring(0, 10),
  ]

  const facetCut = {
    target: publicResolver.address,
    action: 0, // ADD
    selectors: selectors
  }

  const supportInterfaces = [
    "0x2203ab56", // IABIResolver
    "0xf1cb7e06", // IAddressResolver
    "0x3b3b57de", // IAddrResolver
    "0xbc1c58d1", // IContentHashResolver
    "0xa8fa5682", // IDNSRecordResolver
    "0x5c98042b", // IDNSZoneResolver
    "0x124a319c", // IInterfaceResolver
    "0x691f3431", // INameResolver
    "0xc8690233", // IPubKeyResolver
    "0x59d1d43c", // ITextResolver
  ]

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    // "0x0000000000000000000000000000000000000000",
    diamondResolver.address, 
    // "0x",
    diamondResolver.interface.encodeFunctionData(
      "setMultiSupportsInterface",
      [
        supportInterfaces,
        true,
      ]
    ),
  )

  await tx1.wait()

  return await PublicResolverFacet.at(diamondResolver.address)
}

async function deploySocialOracle(_diamondResolver, operator, attestation) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const oracle = await OptiDomainsSocialOracle.new(operator, attestation);
  const oracleFacet = await OptiDomainsSocialOracleFacet.new(operator, attestation);

  const selectors = [
    ethers.utils.id("setWalletWithVerification(bytes32,address,uint256,bytes,bytes,bytes)").substring(0, 10),
    ethers.utils.id("setSocialProfile(bytes32,address,string,string,bytes,bytes)").substring(0, 10),
  ]

  const facetCut = {
    target: oracleFacet.address,
    action: 0, // ADD
    selectors: selectors
  }

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    "0x0000000000000000000000000000000000000000",
    "0x",
  )

  await tx1.wait()

  return [await OptiDomainsSocialOracleFacet.at(diamondResolver.address), await OptiDomainsSocialOracle.at(oracle.address)]
}

async function deployTestAddrResolver(_diamondResolver, action = 0) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const facet = await TestAddrResolver.new();

  const selectors = [
    ethers.utils.id("addr(bytes32)").substring(0, 10),
    ethers.utils.id("addr(bytes32,uint256)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,uint256,bytes)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,address)").substring(0, 10),
  ]

  const facetCut = {
    target: facet.address,
    action, // ADD or REPLACE
    selectors: selectors
  }

  const supportInterfaces = [
    "0xf1cb7e06", // IAddressResolver
    "0x3b3b57de", // IAddrResolver
  ]

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    // "0x0000000000000000000000000000000000000000",
    diamondResolver.address, 
    // "0x",
    diamondResolver.interface.encodeFunctionData(
      "setMultiSupportsInterface",
      [
        supportInterfaces,
        true,
      ]
    ),
  )

  await tx1.wait()

  return await TestAddrResolver.at(diamondResolver.address)
}

async function removeTestAddrResolver(_diamondResolver) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const selectors = [
    ethers.utils.id("addr(bytes32)").substring(0, 10),
    ethers.utils.id("addr(bytes32,uint256)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,uint256,bytes)").substring(0, 10),
    ethers.utils.id("setAddr(bytes32,address)").substring(0, 10),
  ]

  const facetCut = {
    target: "0x0000000000000000000000000000000000000000",
    action: 2, // REMOVE
    selectors: selectors
  }

  const supportInterfaces = [
    "0xf1cb7e06", // IAddressResolver
    "0x3b3b57de", // IAddrResolver
  ]

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    // "0x0000000000000000000000000000000000000000",
    diamondResolver.address, 
    // "0x",
    diamondResolver.interface.encodeFunctionData(
      "setMultiSupportsInterface",
      [
        supportInterfaces,
        false,
      ]
    ),
  )

  await tx1.wait()
}

async function deployWeirdResolver(_diamondResolver, weirdConst) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const facet = await TestWeirdResolver.new(weirdConst);

  const selectors = [
    ethers.utils.id("weird(bytes32)").substring(0, 10),
  ]

  const facetCut = {
    target: facet.address,
    action: 0, // ADD
    selectors: selectors
  }

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    "0x0000000000000000000000000000000000000000",
    "0x",
  )

  await tx1.wait()

  return await TestAddrResolver.at(diamondResolver.address)
}

async function removeWeirdResolver(_diamondResolver) {
  const diamondResolver = await (
    await ethers.getContractFactory('DiamondResolver')
  ).attach(_diamondResolver.address)

  const selectors = [
    ethers.utils.id("weird(bytes32)").substring(0, 10),
  ]

  const facetCut = {
    target: "0x0000000000000000000000000000000000000000",
    action: 2, // REMOVE
    selectors: selectors
  }

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    "0x0000000000000000000000000000000000000000",
    "0x",
  )

  await tx1.wait()
}

async function cloneResolver(diamondResolver, account) {
  const cloneTx = await diamondResolver.clone(generateSalt(account))
  const newResolverAddress = cloneTx.logs[cloneTx.logs.length - 1].args.resolver
  const newResolver = await PublicResolver.at(newResolverAddress)
  return newResolver
}

async function registerSchema(schemaRegistry) {
  await schemaRegistry.register("bytes32 node,uint256 contentType,bytes abi", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,uint256 coinType,bytes address", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes hash", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes zonehashes", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes32 nameHash,uint16 resource,bytes data", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes32 nameHash,uint16 count", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes4 interfaceID,address implementer", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,string name", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,string key,string value", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,bytes32 x,bytes32 y", "0x0000000000000000000000000000000000000000", true);

  await schemaRegistry.register("bytes32 node,uint256 coinType,bytes identity,bytes proof", "0x0000000000000000000000000000000000000000", true);
  await schemaRegistry.register("bytes32 node,string provider,string identity,bytes proof", "0x0000000000000000000000000000000000000000", true);
}

function generateSalt(address) {
  return address + crypto.randomBytes(12).toString('hex')
}

function generateSocialOracleSignature(address, schema, data) {
  // Define the input types and values of the transaction data
  const inputTypes = [
    'bytes1',
    'bytes1',
    'address',
    'uint256',
    'bytes32',
    'bytes32',
    'bytes32',
  ]
  const inputValues = [
    '0x19',
    '0x00',
    address,
    network.config.chainId,
    '0x377446750a403c1b4014436073cf8d08ceadc5b156ac1c8b7b0ca41a0c9c1c54',
    schema,
    ethers.utils.keccak256(data),
  ]

  // ABI-encode the transaction data
  const digest = ethers.utils.solidityKeccak256(inputTypes, inputValues)

  // console.log(
  //   digest,
  //   controller.address,
  //   network.config.chainId,
  //   isTakeover
  //     ? '0x0548274c4be004976424de9f6f485fbe40a8f13e41524cd574fead54e448415c'
  //     : '0xdd007bd789f73e08c2714644c55b11c7d202931d717def434e3c9caa12a9f583',
  //   commitment,
  // )

  const signingKey = new ethers.utils.SigningKey(process.env.DEPLOYER_KEY)
  const signature = signingKey.signDigest(digest)

  return ethers.utils.hexlify(
    ethers.utils.concat([
      signature.r,
      signature.s,
      ethers.utils.hexlify(signature.v),
    ]),
  )
}

function generateSocialOracleRevokeSignature(address, schema, uid) {
  // Define the input types and values of the transaction data
  const inputTypes = [
    'bytes1',
    'bytes1',
    'address',
    'uint256',
    'bytes32',
    'bytes32',
    'bytes32',
  ]
  const inputValues = [
    '0x19',
    '0x00',
    address,
    network.config.chainId,
    '0x9e10ea5887e56efeb96d4464ee7be8e8f408f1a889563a625d293d9d970cc73f',
    schema,
    uid,
  ]

  // ABI-encode the transaction data
  const digest = ethers.utils.solidityKeccak256(inputTypes, inputValues)

  // console.log(
  //   digest,
  //   controller.address,
  //   network.config.chainId,
  //   isTakeover
  //     ? '0x0548274c4be004976424de9f6f485fbe40a8f13e41524cd574fead54e448415c'
  //     : '0xdd007bd789f73e08c2714644c55b11c7d202931d717def434e3c9caa12a9f583',
  //   commitment,
  // )

  const signingKey = new ethers.utils.SigningKey(process.env.DEPLOYER_KEY)
  const signature = signingKey.signDigest(digest)

  return ethers.utils.hexlify(
    ethers.utils.concat([
      signature.r,
      signature.s,
      ethers.utils.hexlify(signature.v),
    ]),
  )
}

contract('PublicResolver', function (accounts) {
  let node
  let attestation, attestationFacet, attestationDiamond
  let ens, resolver, nameWrapper, auth, diamondResolver, nameWrapperRegistry, schemaRegistry, eas, oracleResolver, oracle
  let account
  let signers
  let result

  before(async () => {
    schemaRegistry = await SchemaRegistry.new()
    eas = await EAS.new(schemaRegistry.address)

    await registerSchema(schemaRegistry);
  })

  beforeEach(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    node = namehash.hash('eth')
    ens = await ENS.new(accounts[0])
    nameWrapper = await NameWrapper.new()

    nameWrapperRegistry = await NameWrapperRegistry.new(ens.address);
    attestationFacet = await OptiDomainsAttestationFacet.new(nameWrapperRegistry.address, accounts[0]);
    attestationDiamond = await OptiDomainsAttestationDiamond.new(accounts[0], attestationFacet.address);
    attestation = await OptiDomainsAttestationFacet.at(attestationDiamond.address)

    await attestation.activate([[eas.address, 1, network.config.chainId]])
    await nameWrapperRegistry.upgrade("0x0000000000000000000000000000000000000000", nameWrapper.address)
    await nameWrapperRegistry.setAttestation(attestation.address)

    diamondResolver = await PublicResolver.new(
      accounts[0],
      nameWrapperRegistry.address,
    )

    auth = await deployWhitelistAuthFacet(diamondResolver)
    resolver = await deployPublicResolverFacet(diamondResolver)
    const oracleDeployment = await deploySocialOracle(diamondResolver, new ethers.Wallet(process.env.DEPLOYER_KEY).address, attestation.address)
    oracleResolver = oracleDeployment[0]
    oracle = oracleDeployment[1]

    // resolver = new web3.eth.Contract(PublicResolverABI, diamondResolver.address)

    await auth.setWhitelisted(accounts[9], true)

    await ens.setSubnodeOwner('0x0', sha3('eth'), accounts[0], {
      from: accounts[0],
    })

    await ens.setResolver(node, diamondResolver.address)
  })

  it('Can set address and text with ref', async () => {
    const ADDRESS_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,uint256 coinType,bytes address", "0x0000000000000000000000000000000000000000", true])
    const TEXT_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,string key,string value", "0x0000000000000000000000000000000000000000", true])

    const coinType = 60;

    await resolver.methods['setAddr(bytes32,uint256,bytes)'](node, coinType + 1, accounts[0]);

    const addrAtt0 = await attestation.readRaw(node, ADDRESS_SCHEMA, "0x" + (coinType + 1).toString(16).padStart(64, "0"), false);

    await resolver.setAddrWithRef(node, coinType, addrAtt0.uid, accounts[0]);

    const addrAtt = await attestation.readRaw(node, ADDRESS_SCHEMA, "0x" + coinType.toString(16).padStart(64, "0"), false);

    expect(addrAtt.refUID).to.equal(addrAtt0.uid);

    await resolver.setTextWithRef(node, addrAtt.uid, 'memecoin', 'pepe');

    const textKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('memecoin'))
    const textAtt = await attestation.readRaw(node, TEXT_SCHEMA, textKey, false);

    expect(textAtt.refUID).to.equal(addrAtt.uid);

    const textRefAtt = await attestation.readRef(node, TEXT_SCHEMA, textKey, false);

    expect(textRefAtt.uid).to.equal(addrAtt.uid);
    expect(textRefAtt.refUID).to.equal(addrAtt0.uid);
  })

  it('Social Oracle: Wallet address', async () => {
    const WALLET_ORACLE_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,uint256 coinType,bytes identity,bytes proof", "0x0000000000000000000000000000000000000000", true])
    const SOCIAL_ORACLE_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,string provider,string identity,bytes proof", "0x0000000000000000000000000000000000000000", true])

    const ADDRESS_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,uint256 coinType,bytes address", "0x0000000000000000000000000000000000000000", true])
    const TEXT_SCHEMA = ethers.utils.solidityKeccak256(['string', 'address', 'bool'], ["bytes32 node,string key,string value", "0x0000000000000000000000000000000000000000", true])

    const coinType = 60

    const addrData = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'bytes', 'bytes'],
      [node, coinType, accounts[1], '0x1234']
    )

    const socialSignature = generateSocialOracleSignature(
      oracle.address,
      WALLET_ORACLE_SCHEMA,
      addrData,
    )

    await oracleResolver.setWalletWithVerification(
      node,
      oracle.address,
      coinType,
      accounts[1],
      '0x1234',
      socialSignature,
    )

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    const addrRefAtt = await attestation.readRef(node, ADDRESS_SCHEMA, "0x" + coinType.toString(16).padStart(64, "0"), false);

    expect(addrRefAtt.attester).to.equal(oracle.address);
    expect(addrRefAtt.recipient).to.equal(accounts[0]);
    expect(addrRefAtt.data).to.equal(addrData);

    expect(oracleResolver.setWalletWithVerification(
      node,
      oracle.address,
      coinType,
      accounts[1],
      '0x1234',
      socialSignature,
    )).to.be.revertedWith("DigestAttested(" + ethers.utils.keccak256(addrData) + ")")

    const socialData = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'string', 'string', 'bytes'],
      [node, 'twitter', 'optidomains', '0x2345']
    )

    await oracleResolver.setSocialProfile(
      node,
      oracle.address,
      'twitter',
      'optidomains',
      '0x2345',
      generateSocialOracleSignature(
        oracle.address,
        SOCIAL_ORACLE_SCHEMA,
        socialData,
      )
    )

    assert.equal(await resolver.methods['text(bytes32,string)'](node, 'twitter'), 'optidomains')
    const socialKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('twitter'))
    const socialRefAtt = await attestation.readRef(node, TEXT_SCHEMA, socialKey, false);

    expect(socialRefAtt.attester).to.equal(oracle.address);
    expect(socialRefAtt.recipient).to.equal(accounts[0]);
    expect(socialRefAtt.data).to.equal(socialData);

    await oracle.revoke(
      WALLET_ORACLE_SCHEMA, 
      addrRefAtt.uid, 
      generateSocialOracleRevokeSignature(
        oracle.address,
        WALLET_ORACLE_SCHEMA,
        addrRefAtt.uid,
      )
    )

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    const addrRefAtt2 = await attestation.readRef(node, ADDRESS_SCHEMA, "0x" + coinType.toString(16).padStart(64, "0"), false);

    expect(parseFloat(addrRefAtt2.revocationTime)).to.greaterThan(0);

    expect(oracle.revoke(
      WALLET_ORACLE_SCHEMA, 
      addrRefAtt.uid, 
      generateSocialOracleRevokeSignature(
        oracle.address,
        WALLET_ORACLE_SCHEMA,
        addrRefAtt.uid,
      )
    )).to.be.reverted
  })

  it('Can clone DiamondResolver', async () => {
    const newDiamondResolver = await cloneResolver(diamondResolver, accounts[0])
    expect(await newDiamondResolver.getFallbackAddress()).to.equal(diamondResolver.address)
  })

  it('Restricted false salt from cloning DiamondResolver', async () => {
    expect(cloneResolver(diamondResolver, accounts[1])).to.be.reverted
  })

  it('Can override existing function', async () => {
    await resolver.methods['setAddr(bytes32,address)'](node, accounts[1], {
      from: accounts[0],
    })
    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])

    const newDiamondResolver = await cloneResolver(diamondResolver, accounts[0])
    const newResolver = await PublicResolverFacet.at(newDiamondResolver.address)

    await ens.setResolver(node, newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])

    await newResolver.methods['setAddr(bytes32,address)'](node, accounts[0], {
      from: accounts[0],
    })

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[0])

    await deployTestAddrResolver(newDiamondResolver)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), "0x0000000000000000000000000000000000000001")

    await removeTestAddrResolver(newDiamondResolver)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[0])
  })

  it('Can apply override existing function from base', async () => {
    await resolver.methods['setAddr(bytes32,address)'](node, accounts[1], {
      from: accounts[0],
    })
    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])

    const newDiamondResolver = await cloneResolver(diamondResolver, accounts[0])
    const newResolver = await PublicResolverFacet.at(newDiamondResolver.address)

    await ens.setResolver(node, newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])

    await newResolver.methods['setAddr(bytes32,address)'](node, accounts[0], {
      from: accounts[0],
    })

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[0])

    await deployTestAddrResolver(diamondResolver, 1)

    assert.equal(await resolver.methods['addr(bytes32)'](node), "0x0000000000000000000000000000000000000001")
    assert.equal(await newResolver.methods['addr(bytes32)'](node), "0x0000000000000000000000000000000000000001")
  })

  it('Can add new function', async () => {
    await resolver.methods['setAddr(bytes32,address)'](node, accounts[0], {
      from: accounts[0],
    })
    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])

    const newDiamondResolver = await cloneResolver(diamondResolver, accounts[0])
    const newResolver = await PublicResolverFacet.at(newDiamondResolver.address)

    await ens.setResolver(node, newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[0])

    await newResolver.methods['setAddr(bytes32,address)'](node, accounts[1], {
      from: accounts[0],
    })

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])

    await deployWeirdResolver(newDiamondResolver, 123)

    const oldWeird = await TestWeirdResolver.at(resolver.address)
    const newWeird = await TestWeirdResolver.at(newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    await exceptions.expectFailure(oldWeird.weird(node))
    assert.equal((await newWeird.weird(node)).toNumber(), 123)

    await removeWeirdResolver(newDiamondResolver)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    await exceptions.expectFailure(oldWeird.weird(node))
    await exceptions.expectFailure(newWeird.weird(node))
  })

  it('Can add new function from base', async () => {
    await resolver.methods['setAddr(bytes32,address)'](node, accounts[0], {
      from: accounts[0],
    })
    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])

    const newDiamondResolver = await cloneResolver(diamondResolver, accounts[0])
    const newResolver = await PublicResolverFacet.at(newDiamondResolver.address)

    await ens.setResolver(node, newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[0])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[0])

    await newResolver.methods['setAddr(bytes32,address)'](node, accounts[1], {
      from: accounts[0],
    })

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])

    await deployWeirdResolver(diamondResolver, 234)

    const oldWeird = await TestWeirdResolver.at(resolver.address)
    const newWeird = await TestWeirdResolver.at(newResolver.address)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal((await oldWeird.weird(node)).toNumber(), 234)
    assert.equal((await newWeird.weird(node)).toNumber(), 234)

    await deployWeirdResolver(newResolver, 456)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal((await oldWeird.weird(node)).toNumber(), 234)
    assert.equal((await newWeird.weird(node)).toNumber(), 456)

    await removeWeirdResolver(diamondResolver)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    await exceptions.expectFailure(oldWeird.weird(node))
    assert.equal((await newWeird.weird(node)).toNumber(), 456)

    await removeWeirdResolver(newResolver)

    assert.equal(await resolver.methods['addr(bytes32)'](node), accounts[1])
    assert.equal(await newResolver.methods['addr(bytes32)'](node), accounts[1])
    await exceptions.expectFailure(oldWeird.weird(node))
    await exceptions.expectFailure(newWeird.weird(node))
  })
})

function dnsName(name) {
  // strip leading and trailing .
  const n = name.replace(/^\.|\.$/gm, '')

  var bufLen = n === '' ? 1 : n.length + 2
  var buf = Buffer.allocUnsafe(bufLen)

  offset = 0
  if (n.length) {
    const list = n.split('.')
    for (let i = 0; i < list.length; i++) {
      const len = buf.write(list[i], offset + 1)
      buf[offset] = len
      offset += len + 1
    }
  }
  buf[offset++] = 0
  return (
    '0x' +
    buf.reduce(
      (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
      '',
    )
  )
}

import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ArbitrableProxy, AutoAppealableArbitrator, DiamondResolver, EAS, ENSRegistry, FakeUSDC, InsuranceKycResolver, InsuranceMasterchef, InsuranceOwnershipToken, InsurancePool, InsuranceRegistrar, MockResolverBasicAuth, MockResolverNoAuth, MockResolverRoleAuth, NameWrapperRegistryMock, SchemaRegistry } from "../typechain-types";
import { BigNumberish } from "ethers";
import { v4 as uuid } from "uuid"
import crypto from "crypto"

const namehash = ethers.utils.namehash;
const parseEther = ethers.utils.parseEther;
const formatEther = ethers.utils.formatEther;

function labelhash(label: string) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(label));
}

function randint(min: number, max: number) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function getResolverContract(typeId: number) {
  switch (typeId) {
    case 0: return "No Resolver"
    case 1: return "MockResolverNoAuth"
    case 2: return "MockResolverBasicAuth"
    case 3: return "MockResolverRoleAuth"
    case 4: return "DiamondResolver"
    default: return ""
  }
}

/**
 * Test everything related to insurance flow
 * 
 * Scenario:
 * 1. An insurance pool deployed by a0 (40% owner, 60% pool, 10% withdrawal fee)
 * 2. Add operator as a trusted arbitrable proxy
 * 3. buyInsuranceWithSignature
 * 4. Test that fund is 20% to owner and 80% to pool
 * 5. a1 invest
 * 6. a1 and a2 buyInsuranceWithSignature
 * 7. Test that fund is distributed correctly
 * 8. a2 invest -> check fund in pool and share ratio should remain 1
 * 9. a1 withdraw -> only loss withdrawal fee and share ratio should better
 * 9. a2 claim but not much with signature -> check fund and share ratio in pool
 * 10. a3 invest -> check fund in pool and share ratio should better
 * 11. a1 and a2 claim accumulated to causing loss in pool -> check fund and share ratio in pool
 * 12. a1 buy again small but with a different subdomain -> fund distributed correctly and share ratio is better
 * 13. a3 withdraw -> loss not only withdrawal fee but also share ratio and share ratio should better
 * 14. a4 invest -> share ratio is better
 * 14. a4 buy big lot -> fund distributed correctly and share ratio exceed 1
 * 15. Claim until the pool is empty
 * 16. Investor withdraw all their share
 * 17. a1 buy again then a2 invest again finally a1 claim
 * 18. Wait until insurances are expired
 * 19. Claim -> should revert
 * 20. Buy insurance and new insurance
 * 21. Claim new insurance
 * 22. Wait until insurance pool is expired
 * 23. Buy a new insurance -> should revert
 * 24. Invest more -> should revert
 * 25. Claim -> should revert
 * 26. Test withdraw
 * */ 

const TEST_OPERATOR_PRIVATE_KEY = "0x9d236bd791af771f0810d1f310f533ce1a8463175c1c92d31ca98d0c5796da41"

async function deployPublicResolverFacet(diamondResolver: DiamondResolver) {
  const InsuranceMinimalResolver = await ethers.getContractFactory("InsuranceMinimalResolver");

  const publicResolver = await InsuranceMinimalResolver.deploy();

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
    ethers.utils.id("isAuthorised(address,bytes32)").substring(0, 10),
    ethers.utils.id("setWhitelisted(address,bool)").substring(0, 10),
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

  return InsuranceMinimalResolver.attach(diamondResolver.address)
}

function generateSalt(address: string) {
  return address + crypto.randomBytes(12).toString('hex')
}

async function cloneResolver(diamondResolver: DiamondResolver, account: string) {
  const DiamondResolver = await ethers.getContractFactory("DiamondResolver");
  const cloneRecipt = await (await diamondResolver.clone(generateSalt(account))).wait()
  // const newResolverAddress = cloneTx.logs[cloneTx.logs.length - 1].args.resolver
  let newResolverAddress = cloneRecipt.logs[cloneRecipt.logs.length - 1].topics[2]
  newResolverAddress = '0x' + newResolverAddress.substring(newResolverAddress.length - 40, newResolverAddress.length)
  const newResolver = DiamondResolver.attach(newResolverAddress)
  return newResolver
}

async function registerSchema(schemaRegistry: SchemaRegistry) {
  await (await schemaRegistry.register("bytes32 node,uint256 contentType,bytes abi", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,uint256 coinType,bytes address", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes hash", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes zonehashes", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes32 nameHash,uint16 resource,bytes data", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes32 nameHash,uint16 count", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes4 interfaceID,address implementer", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,string name", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,string key,string value", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes32 x,bytes32 y", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,uint256 coinType,bytes identity,bytes proof", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,string provider,string identity,bytes proof", "0x0000000000000000000000000000000000000000", true)).wait()

  await (await schemaRegistry.register("bytes32 node,bytes32 kycProvider", "0x0000000000000000000000000000000000000000", true)).wait()
  await (await schemaRegistry.register("bytes32 node,bytes32 kycProvider,bytes32 identity,string info", "0x0000000000000000000000000000000000000000", true)).wait()
}

async function deployKycResolver(diamondResolver: DiamondResolver, action = 0) {
  const InsuranceKycResolver = await ethers.getContractFactory("InsuranceKycResolver");

  const facet = await InsuranceKycResolver.deploy();

  const selectors = [
    ethers.utils.id("kyc(bytes32,bytes32)").substring(0, 10),
    ethers.utils.id("provideKyc(bytes32,bytes32,bytes32)").substring(0, 10),
  ]

  const facetCut = {
    target: facet.address,
    action, // ADD or REPLACE
    selectors: selectors
  }

  const supportInterfaces = [
    "0x14d5ab2b", // IKycResolver
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

  return InsuranceKycResolver.attach(diamondResolver.address)
}

describe("Insurance", function () {
  let accounts: SignerWithAddress[];
  let fakeUSDC: FakeUSDC;
  let ens: ENSRegistry, nameWrapperRegistry: NameWrapperRegistryMock, registrar: InsuranceRegistrar, eas: EAS;
  let poolNamehash: string, pool: InsurancePool, ownershipToken: InsuranceOwnershipToken, masterchef: InsuranceMasterchef;
  let resolver: MockResolverNoAuth | MockResolverBasicAuth | MockResolverRoleAuth | InsuranceKycResolver;
  let resolverType = 0;
  let insuranceNodes: {[accountIndex: number]: string[]} = {}

  let arbitrator: AutoAppealableArbitrator, arbitrableProxy: ArbitrableProxy, arbitrationMode = false;

  function pushInsuranceNode(accountIndex: number, node: string) {
    if (!insuranceNodes[accountIndex]) insuranceNodes[accountIndex] = []
    insuranceNodes[accountIndex].push(node)
  }

  async function registerEns(name: string, owner: SignerWithAddress, parent: string = "") {
    const receipt = await (await ens.connect(parent ? owner : accounts[0]).setSubnodeOwner(namehash(parent), labelhash(name), owner.address)).wait();
    const node = ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32'],
      [namehash(parent), ethers.utils.keccak256(ethers.utils.toUtf8Bytes(name))],
    )
    expect(await ens.owner(node)).to.equal(owner.address)

    if (resolverType > 0) {
      await (await ens.connect(owner).setResolver(node, resolver.address)).wait()
      expect(await ens.resolver(node)).to.equal(ethers.utils.getAddress(resolver.address))
    }

    return receipt
  }

  before(async () => {
    accounts = await ethers.getSigners();

    const FakeUSDC = await ethers.getContractFactory("FakeUSDC");
    const ENSRegistry = await ethers.getContractFactory("ENSRegistry");
    const NameWrapperRegistry = await ethers.getContractFactory("NameWrapperRegistryMock");
    const InsuranceRegistrar = await ethers.getContractFactory("InsuranceRegistrar");
    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    const InsuranceMasterchef = await ethers.getContractFactory("InsuranceMasterchef");
    const InsuranceOwnershipToken = await ethers.getContractFactory("InsuranceOwnershipToken");

    const SchemaRegistry = await ethers.getContractFactory("SchemaRegistry");
    const EAS = await ethers.getContractFactory("EAS");
    const EASAttestator = await ethers.getContractFactory("EASAttestator");
    const EASAttestatorFacet = await ethers.getContractFactory("EASAttestatorFacet");

    const Arbitrator = await ethers.getContractFactory("AutoAppealableArbitrator");
    const ArbitrableProxy = await ethers.getContractFactory("ArbitrableProxy");

    fakeUSDC = await FakeUSDC.deploy();

    arbitrator = await Arbitrator.deploy(parseEther("0.01"));
    arbitrableProxy = await ArbitrableProxy.deploy(arbitrator.address);

    const poolTemplate = await InsurancePool.deploy()
    const masterchefTemplate = await InsuranceMasterchef.deploy()
    const ownershipTokenTemplate = await InsuranceOwnershipToken.deploy()

    ens = await ENSRegistry.deploy(accounts[0].address);
    nameWrapperRegistry = await NameWrapperRegistry.deploy(ens.address);
    registrar = await InsuranceRegistrar.deploy(
      nameWrapperRegistry.address,
      poolTemplate.address,
      masterchefTemplate.address,
      ownershipTokenTemplate.address,
    );

    const schemaRegistry = await SchemaRegistry.deploy()
    eas = await EAS.deploy(schemaRegistry.address)
    const attestatorFacet = await EASAttestatorFacet.deploy(nameWrapperRegistry.address, accounts[0].address)
    const attestator_ = await EASAttestator.deploy(accounts[0].address, attestatorFacet.address)
    const attestator = await EASAttestatorFacet.attach(attestator_.address)
    await (await nameWrapperRegistry.setAttestation(attestator.address)).wait()
    await (await attestator.activate([
      {
        chainId: 0,
        eas: eas.address,
        priority: 1
      },
    ])).wait()
    await registerSchema(schemaRegistry)

    // airdrop fake usdc to each address
    await fakeUSDC.mint(accounts[0].address, parseEther("1000000"))
    await fakeUSDC.mint(accounts[1].address, parseEther("1000000"))
    await fakeUSDC.mint(accounts[2].address, parseEther("1000000"))
    await fakeUSDC.mint(accounts[3].address, parseEther("1000000"))
    await fakeUSDC.mint(accounts[4].address, parseEther("1000000"))
    await fakeUSDC.mint(accounts[5].address, parseEther("1000000"))
  })

  // Utils to execute each function
  async function buyInsurance(account: SignerWithAddress, node: string, price: string, expiration: number = 0) {
    if (!expiration) {
      expiration = await time.latest() + 31536000
    }

    const nonce = Math.floor(Math.random() * 1000000000)
    const deadline = await time.latest() + 31536000

    const signer = new ethers.Wallet(TEST_OPERATOR_PRIVATE_KEY)

    const domain = {
      name: 'VeryInsureInsuranceRegistrar', // contract deploy name
      version: '1', // contract deploy version
      chainId: network.config.chainId, // env chain id
      verifyingContract: registrar.address,
    }

    const types = {
      ExecuteDisputeWithSig: [
        { name: 'node', type: 'bytes32' },
        { name: 'digest', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    }

    // console.log(
    //   [
    //     node,
    //     poolNamehash,
    //     parseEther(price),
    //     expiration,
    //     signer.address,
    //     nonce,
    //     0,
    //     "0x",
    //     "0x",
    //     "",
    //   ]
    // )

    /*
      bytes32 node;
      bytes32 pool;
      uint256 price;
      uint256 expiration;
      address approver;
      uint256 disputeId; // External ID
      uint256 approvedAt;
      bytes data;
      bytes arbitratorExtraData;
      string metaEvidenceURI;
    */
    const encoded = ethers.utils.AbiCoder.prototype.encode(
      [
        'bytes32',
        'bytes32',
        'uint256',
        'uint256',
        'address',
        'uint256',
        'uint256',
        'bytes',
        'bytes',
        'string',
      ],
      [
        node,
        poolNamehash,
        parseEther(price),
        expiration,
        signer.address,
        nonce,
        0,
        "0x",
        "0x",
        "",
      ]
    );

    const digest = ethers.utils.keccak256('0x0000000000000000000000000000000000000000000000000000000000000020' + encoded.substring(2))

    // console.log('0x0000000000000000000000000000000000000000000000000000000000000020' + encoded.substring(2))
    // console.log(digest)

    const value = {
      node: node,
      digest,
      nonce,
      deadline,
    }

    const signature = await signer._signTypedData(domain, types, value)

    const tx = await registrar.connect(account).buyInsuranceWithSignature(
      node,
      poolNamehash,
      parseEther(price),
      expiration,
      signer.address,
      nonce,
      deadline,
      "0x",
      signature,
    )

    return await tx.wait();
  }

  async function buyInsuranceWithDispute(account: SignerWithAddress, node: string, price: string, expiration: number = 0) {
    if (!expiration) {
      expiration = await time.latest() + 31536000
    }
    
    const tx = await registrar.connect(account).buyInsuranceWithArbitration(
      node,
      poolNamehash,
      parseEther(price),
      expiration,
      arbitrableProxy.address,
      "0x",
      "0x",
      "https://very.insure",
      {
        value: parseEther("0.01"),
      },
    )

    return await tx.wait();
  }

  async function buyInsuranceWithDisputeExecute(account: SignerWithAddress, node: string) {
    const receipt = await (await registrar.connect(account).buyInsuranceFinalize(node)).wait()
    expect(registrar.connect(account).buyInsuranceFinalize(node)).to.be.reverted
    return receipt
  }

  async function claimInsurance(account: SignerWithAddress, node: string, amount: string) {
    const nonce = Math.floor(Math.random() * 1000000000)
    const deadline = await time.latest() + 31536000

    const signer = new ethers.Wallet(TEST_OPERATOR_PRIVATE_KEY)

    const claimId = (await pool.latestClaimId(node)).toNumber() + 1

    const domain = {
      name: 'VeryInsureInsurancePool', // contract deploy name
      version: '1', // contract deploy version
      chainId: network.config.chainId, // env chain id
      verifyingContract: pool.address,
    }

    const types = {
      ExecuteDisputeWithSig: [
        { name: 'node', type: 'bytes32' },
        { name: 'digest', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    }

    // console.log(
    //   [
    //     node,
    //     claimId,
    //     account.address,
    //     parseEther(amount),
    //     signer.address,
    //     nonce,
    //     0,
    //     "0x",
    //     "0x",
    //     "",
    //   ]
    // )

    /*
        bytes32 node;
        uint256 claimId;

        address recipient;
        uint256 amount;

        address approver;
        uint256 disputeId; // External ID
        uint256 approvedAt;

        bytes data;
        bytes arbitratorExtraData;
        string metaEvidenceURI;
    */
    const encoded = ethers.utils.AbiCoder.prototype.encode(
      [
        'bytes32',
        'uint256',
        'address',
        'uint256',
        'address',
        'uint256',
        'uint256',
        'bytes',
        'bytes',
        'string',
      ],
      [
        node,
        claimId,
        account.address,
        parseEther(amount),
        signer.address,
        nonce,
        0,
        "0x",
        "0x",
        "",
      ]
    );

    const digest = ethers.utils.keccak256('0x0000000000000000000000000000000000000000000000000000000000000020' + encoded.substring(2))

    // console.log('0x0000000000000000000000000000000000000000000000000000000000000020' + encoded.substring(2))
    // console.log(digest)
    // console.log(poolNamehash)
    // console.log(deadline)

    const value = {
      node: poolNamehash,
      digest,
      nonce,
      deadline,
    }

    const signature = await signer._signTypedData(domain, types, value)

    const tx = await pool.connect(account).claimWithSignature(
      node,
      account.address,
      parseEther(amount),
      signer.address,
      nonce,
      deadline,
      "0x",
      signature,
    )

    return await tx.wait();
  }

  async function claimInsuranceWithDispute(account: SignerWithAddress, node: string, amount: string) {
    const tx = await pool.connect(account).claimWithArbitration(
      node,
      account.address,
      parseEther(amount),
      arbitrableProxy.address,
      "0x",
      "0x",
      "https://very.insure",
      {
        value: parseEther("0.01"),
      },
    )

    return await tx.wait();
  }

  async function claimInsuranceWithDisputeExecute(node: string, claimId: any) {
    const receipt = await (await pool.claimFinalize(node, claimId)).wait()
    expect(pool.claimFinalize(node, claimId)).to.reverted
    return receipt
  }

  async function insuranceAsset() {
    const FakeUSDC = await ethers.getContractFactory("FakeUSDC");
    const asset = await pool.asset()
    return FakeUSDC.attach(asset)
  }

  // Utils to test each function
  async function expectApprox(a: string | number, b: string | number) {
    expect(parseFloat(a.toString()).toPrecision(4)).to.equal(parseFloat(b.toString()).toPrecision(4))
  }

  async function expectApproxEther(a: BigNumberish, b: BigNumberish) {
    expectApprox(formatEther(a), formatEther(b))
  }

  // Constraints
  async function testPoolConstaints() {
    const asset = await insuranceAsset()

    const ZERO = ethers.BigNumber.from(0)

    const totalAsset = await asset.balanceOf(pool.address)
    const totalShare = await pool.totalSupply()
    const expiration = (await pool.expiration()).toNumber()
    const withdrawalFee = await pool.withdrawalFee()
    const now = await time.latest()

    // 1:1
    expect(await pool.previewDeposit(parseEther("1"))).to.equal(parseEther("1"))
    expect(await pool.previewMint(parseEther("1"))).to.equal(parseEther("1"))

    const previewWithdraw = await pool.previewWithdraw(parseEther("1"));
    const previewRedeem = await pool.previewRedeem(parseEther("1"));

    const baseWithdraw = totalAsset.isZero() ? ZERO : parseEther("1").mul(totalShare).div(totalAsset);
    const baseRedeem = totalShare.isZero() ? ZERO : parseEther("1").mul(totalAsset).div(totalShare);

    if (expiration == 0 || now < expiration) {
      if (totalAsset.gt(totalShare)) {
        // Case asset > share (profit -> only loss withdrawal fee)
        expectApproxEther(previewWithdraw, parseEther("1").mul(10000).div(10000 - withdrawalFee.toNumber()))
        expectApproxEther(previewRedeem, parseEther("1").mul(10000 - withdrawalFee.toNumber()).div(10000))
      } else {
        // Case asset > share (profit -> loss share ratio and withdrawal fee)
        expectApproxEther(previewWithdraw, baseWithdraw.mul(10000).div(10000 - withdrawalFee.toNumber()))
        expectApproxEther(previewRedeem, baseRedeem.mul(10000 - withdrawalFee.toNumber()).div(10000))
      }
    } else {
      // Withdraw according to share ratio
      expectApproxEther(previewWithdraw, baseWithdraw)
      expectApproxEther(previewRedeem, baseRedeem)
    }
  }

  async function testOwnershipTokenConstraints() {
    const asset = await insuranceAsset()

    // const totalShare = await ownershipToken.totalSupply()
    const totalAsset = await ownershipToken.total(asset.address)
    const remainingAsset = await asset.balanceOf(ownershipToken.address)
    let debt = ethers.BigNumber.from(0)
    let shares = ethers.BigNumber.from(0)
    
    for (let i = 0; i < 7; i++) {
      debt = debt.add(await ownershipToken.debt(asset.address, accounts[i].address))
      shares = shares.add(await ownershipToken.balanceOf(accounts[i].address))
    }

    expect(shares).to.equal(parseEther("10000"))
    expectApproxEther(totalAsset.sub(debt), remainingAsset)

    // console.log('OwnershipToken:', totalAsset)
  }

  async function testMasterchefConstraints() {
    const asset = await insuranceAsset()

    const poolSupply = await pool.totalSupply()
    const totalShare = await masterchef.totalShares()
    const totalAsset = await masterchef.totalAssets(asset.address)
    const remainingAsset = await asset.balanceOf(masterchef.address)

    let debt = ethers.BigNumber.from(0)
    let shares = ethers.BigNumber.from(0)
    
    for (let i = 0; i < 7; i++) {
      debt = debt.add(await masterchef.debt(asset.address, accounts[i].address))
      shares = shares.add(await masterchef.shares(accounts[i].address))
    }

    expect(totalShare).to.equal(poolSupply)
    expect(totalShare).to.equal(shares)
    expectApproxEther(totalAsset.sub(debt), remainingAsset)

    // console.log('Masterchef:', totalAsset)
  }

  async function testInsuranceConstraints() {
    await testPoolConstaints();
    await testOwnershipTokenConstraints();
    await testMasterchefConstraints();
  }

  // Test action function
  async function deployPool(accountIndex: number) {
    const node = namehash("a" + accountIndex + "-" + resolverType)

    const ownerShare = randint(500, 1000)
    const withdrawalFee = randint(500, 1000)
    const instantReward = randint(500, 1000)

    const expiration = await time.latest() + 94536000

    if (resolverType > 1 && resolverType < 4) {
      await expect(registrar.connect(accounts[accountIndex]).deployPool(
        node,
        fakeUSDC.address,
        expiration,
        ownerShare,
        withdrawalFee,
        instantReward,
        "Test " + accountIndex,
        "TEST" + accountIndex,
      )).to.be.revertedWithCustomError(registrar, `Unauthorised`)
    }

    if (resolverType == 2) {
      const resolverBasic: MockResolverBasicAuth = resolver as MockResolverBasicAuth
      await (await resolverBasic.setAuthorised(node, accounts[accountIndex].address, true)).wait()
    }

    if (resolverType == 3) {
      const resolverRole: MockResolverRoleAuth = resolver as MockResolverRoleAuth
      await (await resolverRole.setAuthorised(node, accounts[accountIndex].address, true, true, false)).wait()
    }

    const tx = await registrar.connect(accounts[accountIndex]).deployPool(
      node,
      fakeUSDC.address,
      expiration,
      ownerShare,
      withdrawalFee,
      instantReward,
      "Test " + accountIndex,
      "TEST" + accountIndex,
    )
    await tx.wait()

    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    const InsuranceMasterchef = await ethers.getContractFactory("InsuranceMasterchef");
    const InsuranceOwnershipToken = await ethers.getContractFactory("InsuranceOwnershipToken");

    const poolInformation = await registrar.poolInformation(node);

    poolNamehash = node
    pool = InsurancePool.attach(poolInformation.pool)
    masterchef = InsuranceMasterchef.attach(poolInformation.masterchef)
    ownershipToken = InsuranceOwnershipToken.attach(poolInformation.ownershipToken)

    // Add operator
    const signer = new ethers.Wallet(TEST_OPERATOR_PRIVATE_KEY)

    if (resolverType == 3) {
      await expect(registrar.connect(accounts[accountIndex]).setTrustedArbitrableProxy(node, signer.address, true))
        .to.be.revertedWithCustomError(registrar, `Unauthorised`)

      const resolverRole: MockResolverRoleAuth = resolver as MockResolverRoleAuth
      await (await resolverRole.setAuthorised(node, accounts[accountIndex].address, true, true, true)).wait()
    }

    await (await registrar.connect(accounts[accountIndex]).setTrustedArbitrableProxy(node, signer.address, true)).wait();
    await (await registrar.connect(accounts[accountIndex]).setTrustedArbitrableProxy(node, arbitrableProxy.address, true)).wait();

    await testInsuranceConstraints();
  }

  async function testBuyInsurance(account: SignerWithAddress, node: string, price: string, expiration: number = 0) {
    const parsedPrice = parseEther(price)

    const poolInformation = await registrar.poolInformation(node);
    const factoryWallet = await registrar.owner();
    const instantReward = await pool.instantReward();
    
    const factoryBalanceBefore = await fakeUSDC.balanceOf(factoryWallet);
    const userBalanceBefore = await fakeUSDC.balanceOf(account.address);
    const poolBalanceBefore = await fakeUSDC.balanceOf(pool.address);
    const masterchefBalanceBefore = await fakeUSDC.balanceOf(masterchef.address);
    const ownershipTokenBalanceBefore = await fakeUSDC.balanceOf(ownershipToken.address);
    const masterchefTotalSharesBefore = await masterchef.totalShares();

    const masterchefTotalAssetsBefore = await masterchef.totalAssets(fakeUSDC.address);
    const ownershipTotalAssetsBefore = await ownershipToken.total(fakeUSDC.address);

    let result; 
    
    if (arbitrationMode) {
      await buyInsuranceWithDispute(account, node, price, expiration)
      
      const disputeId = (await registrar.insurances(node)).disputeId
      await (await arbitrator.giveRuling(disputeId, 1)).wait()

      result = await buyInsuranceWithDisputeExecute(account, node)
    } else {
      result = await buyInsurance(account, node, price, expiration)
    }

    const factoryBalanceAfter = await fakeUSDC.balanceOf(factoryWallet);
    const userBalanceAfter = await fakeUSDC.balanceOf(account.address);
    const poolBalanceAfter = await fakeUSDC.balanceOf(pool.address);
    const masterchefBalanceAfter = await fakeUSDC.balanceOf(masterchef.address);
    const ownershipTokenBalanceAfter = await fakeUSDC.balanceOf(ownershipToken.address);
    const masterchefTotalSharesAfter = await masterchef.totalShares();

    const masterchefTotalAssetsAfter = await masterchef.totalAssets(fakeUSDC.address);
    const ownershipTotalAssetsAfter = await ownershipToken.total(fakeUSDC.address);

    expect(masterchefTotalSharesAfter).to.equal(masterchefTotalSharesBefore)
    expect(userBalanceBefore.sub(userBalanceAfter)).to.equal(parsedPrice)

    const factorySlice = parsedPrice.mul(poolInformation.factoryFee).div(10000)
    const ownerSlice = parsedPrice.mul(poolInformation.ownerShare).div(10000)
    const poolSlice = parsedPrice.sub(factorySlice).sub(ownerSlice)

    expectApproxEther(factorySlice, factoryBalanceAfter.sub(factoryBalanceBefore))
    expectApproxEther(ownerSlice, ownershipTokenBalanceAfter.sub(ownershipTokenBalanceBefore))
    expectApproxEther(ownerSlice, ownershipTotalAssetsAfter.sub(ownershipTotalAssetsBefore))

    if (masterchefTotalSharesAfter.isZero()) {
      expectApproxEther(poolSlice, poolBalanceAfter.sub(poolBalanceBefore))
    } else {
      const masterchefSlice = poolSlice.mul(instantReward).div(10000)
      const actualPoolSlice = poolSlice.sub(masterchefSlice)

      expectApproxEther(masterchefSlice, masterchefBalanceAfter.sub(masterchefBalanceBefore))
      expectApproxEther(masterchefSlice, masterchefTotalAssetsAfter.sub(masterchefTotalAssetsBefore))
      expectApproxEther(actualPoolSlice, poolBalanceAfter.sub(poolBalanceBefore))
    }

    await testInsuranceConstraints();

    return result;
  }

  async function testBuyInsuranceManaged(accountIndex: number, price: string, expiration: number = 0) {
    const id = uuid();
    const node = namehash(id + ".a" + accountIndex + "-" + resolverType)

    await registerEns(id, accounts[accountIndex], "a" + accountIndex + "-" + resolverType)

    await (await fakeUSDC.connect(accounts[accountIndex]).approve(registrar.address, parseEther(price))).wait()

    if (resolverType > 1 && resolverType < 4) {
      if (resolverType == 3) {
        const resolverRole: MockResolverRoleAuth = resolver as MockResolverRoleAuth
        await (await resolverRole.setAuthorised(node, accounts[accountIndex].address, true, true, false)).wait()
      }

      await expect(testBuyInsurance(accounts[accountIndex], node, price, expiration)).to.be.rejected

      if (resolverType == 2) {
        const resolverBasic: MockResolverBasicAuth = resolver as MockResolverBasicAuth
        await (await resolverBasic.setAuthorised(node, accounts[accountIndex].address, true)).wait()
      }
  
      if (resolverType == 3) {
        const resolverRole: MockResolverRoleAuth = resolver as MockResolverRoleAuth
        await (await resolverRole.setAuthorised(node, accounts[accountIndex].address, true, true, true)).wait()
      }
    }
    
    pushInsuranceNode(accountIndex, node)

    return {
      node,
      receipt: await testBuyInsurance(accounts[accountIndex], node, price, expiration),
    }
  }

  async function testInvest(accountIndex: number, amount: string) {
    const parsedAmount = parseEther(amount)
    const account = accounts[accountIndex]

    await (await fakeUSDC.connect(account).approve(pool.address, parsedAmount)).wait()    

    const assetBefore = await fakeUSDC.balanceOf(pool.address)
    const shareBefore = await pool.totalSupply()
    const pendingRewardBefore = await masterchef.pendingReward(account.address, fakeUSDC.address)

    const assetBalanceBefore = await fakeUSDC.balanceOf(account.address)
    const shareBalanceBefore = await pool.balanceOf(account.address)

    const result = await (await pool.connect(account).deposit(parsedAmount, account.address)).wait()
    
    await testInsuranceConstraints();

    const assetAfter = await fakeUSDC.balanceOf(pool.address)
    const shareAfter = await pool.totalSupply()
    const pendingRewardAfter = await masterchef.pendingReward(account.address, fakeUSDC.address)

    const assetBalanceAfter = await fakeUSDC.balanceOf(account.address)
    const shareBalanceAfter = await pool.balanceOf(account.address)

    expect(pendingRewardAfter).to.equal(0)
    expect(assetAfter.sub(assetBefore)).to.equal(parsedAmount)
    expect(shareAfter.sub(shareBefore)).to.equal(parsedAmount)
    expect(assetBalanceBefore.sub(assetBalanceAfter)).to.equal(parsedAmount.sub(pendingRewardBefore))
    expect(shareBalanceAfter.sub(shareBalanceBefore)).to.equal(parsedAmount)

    return result;
  }

  async function testWithdraw(accountIndex: number, amount: string) {
    const parsedAmount = parseEther(amount)
    const account = accounts[accountIndex]

    const withdrawalFee = await pool.withdrawalFee()
    const expiration = (await pool.expiration()).toNumber()
    const latestTime = await time.latest()
    const afterFee = ethers.BigNumber.from(10000).sub(withdrawalFee)

    const assetBefore = await fakeUSDC.balanceOf(pool.address)
    const shareBefore = await pool.totalSupply()
    const assetBalanceBefore = await fakeUSDC.balanceOf(account.address)
    const shareBalanceBefore = await pool.balanceOf(account.address)

    const pendingRewardBefore = await masterchef.pendingReward(account.address, fakeUSDC.address)

    const result = await (await pool.connect(accounts[accountIndex]).redeem(parsedAmount, account.address, account.address)).wait()
    
    await testInsuranceConstraints();

    const assetAfter = await fakeUSDC.balanceOf(pool.address)
    const shareAfter = await pool.totalSupply()
    const assetBalanceAfter = await fakeUSDC.balanceOf(account.address)
    const shareBalanceAfter = await pool.balanceOf(account.address)

    const pendingRewardAfter = await masterchef.pendingReward(account.address, fakeUSDC.address)

    expect(pendingRewardAfter).to.equal(0)
    expect(shareBefore.sub(shareAfter)).to.equal(parsedAmount)
    expect(shareBalanceBefore.sub(shareBalanceAfter)).to.equal(parsedAmount)

    let shouldReceive = parsedAmount

    if (shareBefore.isZero()) {
      shouldReceive = ethers.BigNumber.from(0)
    } else {
      if (latestTime >= expiration) {
        // Rely on share ratio only
        const shareRatio = assetBefore.mul(10000000).div(shareBefore)
        shouldReceive = parsedAmount.mul(shareRatio).div(10000000)
      } else {
        if (assetBefore.lt(shareBefore)) {
          // Pay the withdrawal fee + share ratio loss
          const shareRatio = assetBefore.mul(10000000).div(shareBefore)
          shouldReceive = parsedAmount.mul(shareRatio).div(10000000)
        }
    
        shouldReceive = shouldReceive.mul(afterFee).div(10000)
      }
    }

    expectApproxEther(assetBefore.sub(assetAfter), shouldReceive)
    expectApproxEther(assetBalanceAfter.sub(assetBalanceBefore), shouldReceive.add(pendingRewardBefore))

    return result;
  }

  async function testClaim(accountIndex: number, amount: string) {
    const parsedAmount = parseEther(amount)
    const account = accounts[accountIndex]

    const i = randint(0, insuranceNodes[accountIndex].length - 1)
    const node = insuranceNodes[accountIndex][i]

    const claimIdBefore = await pool.latestClaimId(node)
    const assetBefore = await fakeUSDC.balanceOf(pool.address)
    const shareBefore = await pool.totalSupply()
    const assetBalanceBefore = await fakeUSDC.balanceOf(account.address)
    const shareBalanceBefore = await pool.balanceOf(account.address)

    let receipt;

    if (arbitrationMode) {
      await claimInsuranceWithDispute(account, node, amount)
      
      const claimId = await pool.latestClaimId(node)
      const disputeId = (await pool.claims(node, claimId)).disputeId
      await (await arbitrator.giveRuling(disputeId, 1)).wait()

      receipt = await claimInsuranceWithDisputeExecute(node, claimId)
    } else {
      await claimInsurance(account, node, amount)
    }

    await testInsuranceConstraints();

    const claimIdAfter = await pool.latestClaimId(node)
    const assetAfter = await fakeUSDC.balanceOf(pool.address)
    const shareAfter = await pool.totalSupply()
    const assetBalanceAfter = await fakeUSDC.balanceOf(account.address)
    const shareBalanceAfter = await pool.balanceOf(account.address)

    expect(claimIdAfter).to.equal(claimIdBefore.add(1))
    expect(assetBefore.sub(assetAfter)).to.equal(parsedAmount)
    expect(shareAfter).to.equal(shareBefore)
    expect(assetBalanceAfter.sub(assetBalanceBefore)).to.equal(parsedAmount)
    expect(shareBalanceAfter).to.equal(shareBalanceBefore)

    return {
      node,
      receipt,
    }
  }

  async function testOwnershipTokenHarvest(account: string) {
    const pendingReward = await ownershipToken.pendingReward(account, fakeUSDC.address)
    const balanceBefore = await fakeUSDC.balanceOf(account)

    const recipt = await (await ownershipToken.harvestAll(account)).wait();

    const balanceAfter = await fakeUSDC.balanceOf(account)

    expect(balanceAfter.sub(balanceBefore)).to.equal(pendingReward)

    return recipt
  }

  for (let resolverTypeI = 0; resolverTypeI < 5; resolverTypeI++) {
    describe("Resolver: " + getResolverContract(resolverTypeI), function () {
      before(async function () {
        arbitrationMode = false;
        insuranceNodes = {};
        resolverType = resolverTypeI;

        if (resolverType > 0 && resolverType < 4) {
          const Resolver = await ethers.getContractFactory(getResolverContract(resolverType));
          resolver = await Resolver.deploy() as MockResolverNoAuth | MockResolverBasicAuth | MockResolverRoleAuth;
        }

        if (resolverType == 4) {
          const DiamondResolver = await ethers.getContractFactory("DiamondResolver")
          const diamondResolver = await DiamondResolver.deploy(accounts[0].address, nameWrapperRegistry.address)
          const baseResolver = await deployPublicResolverFacet(diamondResolver)
          const clonedResolver = await cloneResolver(diamondResolver, accounts[0].address)
          resolver = await deployKycResolver(clonedResolver)
        }

        // register ens name ready for test
        for (let i = 0; i < 5; i++) {
          await registerEns("a" + i + "-" + resolverType, accounts[i])

          const node = namehash("a" + i + "-" + resolverType)
  
          // reset authorisation
          if (resolverType == 2) {
            const resolverBasic: MockResolverBasicAuth = resolver as MockResolverBasicAuth
            await (await resolverBasic.setAuthorised(node, accounts[i].address, false)).wait()
          }
      
          if (resolverType == 3) {
            const resolverRole: MockResolverRoleAuth = resolver as MockResolverRoleAuth
            await (await resolverRole.setAuthorised(node, accounts[i].address, false, false, false)).wait()
          }
        }

      })

      for (let i = 0; i < 2; i++) {
        describe(i == 0 ? "Normal Flow" : "Arbitration Flow", function () {
          it("Should be able to deploy pool", async function () {
            await deployPool(i);
      
            // Transfer ownership token to another address;
            await ownershipToken.connect(accounts[i]).transfer(accounts[0].address, parseEther("10000"))
            await ownershipToken.transfer(accounts[1].address, parseEther("1000"))
            await ownershipToken.transfer(accounts[2].address, parseEther("2000"))
          })
      
          it("a1 buy insurance", async function () {
            await testBuyInsuranceManaged(1, "100");
          })
      
          it("a1 invest", async function () {
            await testInvest(1, "400");
          })
      
          it("a1, a2 buy insurance", async function () {
            await testBuyInsuranceManaged(1, "50");
            await testBuyInsuranceManaged(2, "200");
          })
      
          it("a2 invest", async function () {
            await testInvest(2, "100");
          })
      
          it("a1 withdraw small", async function () {
            await testWithdraw(1, "200");
          })
      
          it("a2 claim small", async function () {
            await testClaim(2, "100");
          })
      
          it("a3 invest", async function () {
            await testInvest(3, "200");
          })
      
          it("a1, a2 claim to loss", async function () {
            await testClaim(1, "300");
            await testClaim(2, "200");
          })
      
          it("a1 buy insurance again", async function () {
            await testBuyInsuranceManaged(1, "50");
          })
      
          it("a3 withdraw after in loss", async function () {
            await testWithdraw(3, "100");
          })
      
          it("a4 invest after in loss", async function () {
            await testInvest(4, "50");
          })
      
          it("a4 buy big lot", async function () {
            await testBuyInsuranceManaged(4, "200");
            await testBuyInsuranceManaged(4, "500");
          })
    
          it("Claim as much as possible", async function () {
            const poolBalance = await fakeUSDC.balanceOf(pool.address)
            const feasibleBalance = poolBalance.div(20).sub(1000000000000000)
            await testClaim(4, formatEther(feasibleBalance));
          })
      
          it("Withdraw all share", async function () {
            const shareBalance1 = await pool.balanceOf(accounts[1].address)
            const shareBalance2 = await pool.balanceOf(accounts[2].address)
            const shareBalance3 = await pool.balanceOf(accounts[3].address)
            const shareBalance4 = await pool.balanceOf(accounts[4].address)
            const shareBalance5 = await pool.balanceOf(accounts[5].address)
      
            await testWithdraw(1, formatEther(shareBalance1))
            await testWithdraw(2, formatEther(shareBalance2))
            await testWithdraw(3, formatEther(shareBalance3))
            await testWithdraw(4, formatEther(shareBalance4))
            await testWithdraw(5, formatEther(shareBalance5))
      
            expect(await pool.totalSupply()).to.equal(0)
          })
      
          it("Harvest all ownership token share", async function () {
            await testOwnershipTokenHarvest(accounts[1].address)
            await testOwnershipTokenHarvest(accounts[2].address)
          })
    
          it("a1 buy again", async function () {
            await testBuyInsuranceManaged(1, "500");
          })
    
          it("invest back again", async function () {
            await testInvest(1, "300");
            await testInvest(2, "200");
            await testInvest(3, "500");
          })
    
          it("wait until insurances are expired", async function () {
            await time.increase(31546000);
          })
    
          it("shouldn't be claimable as the insurance is expired", async function () {
            await expect(testClaim(1, "10")).to.be.rejected
            await testInsuranceConstraints()
          })
    
          it("should be able to buy a new insurance", async function () {
            insuranceNodes[1] = []
            await testBuyInsuranceManaged(1, "500");
          })
    
          it("claim new insurance", async function () {
            await testClaim(1, "300");
            await expect(testClaim(2, "200")).to.be.rejected;
          })
    
          it("wait until pool is expired", async function () {
            await time.increase(62990000);
          })
    
          it("shouldn't be able to buy insurance anymore", async function () {
            await expect(testBuyInsuranceManaged(1, "500")).to.be.rejected;
            await testInsuranceConstraints()
          })
    
          it("shouldn't be able to invest anymore", async function () {
            await expect(testInvest(1, "300")).to.be.rejected;
            await testInsuranceConstraints()
          })
    
          it("shouldn't be able to claim anymore", async function () {
            await expect(testClaim(1, "300")).to.be.rejected;
            await testInsuranceConstraints()
          })
    
          it("Withdraw all share to harvest all reward", async function () {
            const shareBalance1 = await pool.balanceOf(accounts[1].address)
            const shareBalance2 = await pool.balanceOf(accounts[2].address)
            const shareBalance3 = await pool.balanceOf(accounts[3].address)
            const shareBalance4 = await pool.balanceOf(accounts[4].address)
      
            await testWithdraw(1, formatEther(shareBalance1))
            await testWithdraw(2, formatEther(shareBalance2))
            await testWithdraw(3, formatEther(shareBalance3))
            await testWithdraw(4, formatEther(shareBalance4))
      
            expect(await pool.totalSupply()).to.equal(0)
          })

          if (resolverTypeI == 4) {
            const schemaBase = ethers.utils.solidityKeccak256(["string", "address", "bool"], ["bytes32 node,bytes32 kycProvider", "0x0000000000000000000000000000000000000000", true])
            const schemaProvider = ethers.utils.solidityKeccak256(["string", "address", "bool"], ["bytes32 node,bytes32 kycProvider,bytes32 identity,string info", "0x0000000000000000000000000000000000000000", true])
            const data = ethers.utils.defaultAbiCoder.encode(
              ["bytes32", "bytes32", "bytes32", "string"],
              [
                namehash("a1-4"),
                namehash("a0-4"),
                namehash("identity"),
                "Your passport number: ABC1234",
              ]
            )

            it("Can provide KYC without expiration", async function () {
              const attestTx = await eas.attest({
                schema: schemaProvider,
                data: {
                  data,
                  expirationTime: 0,
                  recipient: accounts[1].address,
                  refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
                  revocable: true,
                  value: 0,
                }
              })

              const attestReciept = await attestTx.wait()
              const uid = attestReciept.logs[attestReciept.logs.length - 1].data

              const kycResolver: InsuranceKycResolver = resolver as InsuranceKycResolver

              await (await kycResolver.provideKyc(
                namehash("a1-4"),
                namehash("a0-4"),
                uid,
              )).wait()

              const kycData = await kycResolver.kyc(namehash("a1-4"), namehash("a0-4"))

              expect(kycData[0]).to.equal(uid)
              expect(kycData[1]).to.equal(namehash("identity"))
              expect(kycData[2]).to.equal(0)
            })

            it("Can provide KYC with expiration", async function () {
              const expirationTime = await time.latest() + 100

              const attestTx = await eas.attest({
                schema: schemaProvider,
                data: {
                  data,
                  expirationTime,
                  recipient: accounts[1].address,
                  refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
                  revocable: true,
                  value: 0,
                }
              })

              const attestReciept = await attestTx.wait()
              const uid = attestReciept.logs[attestReciept.logs.length - 1].data

              const kycResolver: InsuranceKycResolver = resolver as InsuranceKycResolver

              await (await kycResolver.provideKyc(
                namehash("a1-4"),
                namehash("a0-4"),
                uid,
              )).wait()

              const kycData = await kycResolver.kyc(namehash("a1-4"), namehash("a0-4"))

              expect(kycData[0]).to.equal(uid)
              expect(kycData[1]).to.equal(namehash("identity"))
              expect(kycData[2]).to.equal(expirationTime)

              await time.increase(100)

              expect(kycResolver.kyc(namehash("a1-4"), namehash("a0-4"))).to.be.reverted
            })

            it("Can't provide KYC as another provider", async function () {
              const attestTx = await eas.attest({
                schema: schemaProvider,
                data: {
                  data,
                  expirationTime: 0,
                  recipient: accounts[1].address,
                  refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
                  revocable: true,
                  value: 0,
                }
              })

              const attestReciept = await attestTx.wait()
              const uid = attestReciept.logs[attestReciept.logs.length - 1].data

              const kycResolver: InsuranceKycResolver = resolver as InsuranceKycResolver

              expect(kycResolver.provideKyc(
                namehash("a1-4"),
                namehash("a2-4"),
                uid,
              )).to.be.reverted

              expect(kycResolver.provideKyc(
                namehash("a2-4"),
                namehash("a0-4"),
                uid,
              )).to.be.reverted
            })
          }
      
          after(async function () {
            arbitrationMode = true;
            insuranceNodes = {};
          })
        })
      }
    })
  }

});

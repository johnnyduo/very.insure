import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const ownerSigner = await ethers.getSigner(owner)

  const deployArgs = {
    from: deployer,
    args: [],
    log: true,
  }

  const deployment = await deploy('PublicResolverFacet', deployArgs)
  // if (!deployment.newlyDeployed) return

  const diamondResolver = await ethers.getContract('DiamondResolver', owner)
  const publicResolver = await ethers.getContract('PublicResolverFacet', owner)

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
    "0x9061b923", // IExtendedResolver
  ]

  const tx1 = await diamondResolver.connect(ownerSigner).diamondCut(
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
  
  console.log(JSON.stringify([
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
  ], undefined, 2))

  await tx1.wait()
}

func.id = 'public-resolver'
func.tags = ['PublicResolverFacet']
func.dependencies = []

export default func
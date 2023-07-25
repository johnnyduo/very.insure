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

  const deployment = await deploy('RegistryWhitelistAuthFacet', deployArgs)
  // if (!deployment.newlyDeployed) return

  const diamondResolver = await ethers.getContract('DiamondResolver', owner)
  const auth = await ethers.getContract('RegistryWhitelistAuthFacet', owner)

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

  // Whitelist controller and reverseRegistrar
  const controller = await ethers.getContract('WhitelistRegistrarController', owner)
  const reverseRegistrar = await ethers.getContract('ReverseRegistrar', owner)

  const RegistryWhitelistAuthFacet = await ethers.getContractFactory("RegistryWhitelistAuthFacet");
  const facet = RegistryWhitelistAuthFacet.attach(diamondResolver.address);

  await (await facet.setWhitelisted(controller.address, true)).wait()
  await (await facet.setWhitelisted(reverseRegistrar.address, true)).wait()
}

func.id = 'registry-whitelist-auth'
func.tags = ['RegistryWhitelistAuthFacet']
func.dependencies = []

export default func
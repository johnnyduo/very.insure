import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return;

  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const ownerSigner = await ethers.getSigner(owner)

  const diamondResolver = await ethers.getContract('DiamondResolver', owner)

  const PublicResolverFacet = await ethers.getContractFactory("PublicResolverFacet");
  const facet = PublicResolverFacet.attach(diamondResolver.address);

  await (await facet["setAddr(bytes32,address)"]("0x0fa56c43eedabdfa29f74db5adea402d6e449ae603d8298b4be842134f34e5a3", "0x3beb93Cd777EAab48d09d37A80e00853f9A2a895", {
    "gasLimit": "10000000"
  })).wait();
}

func.id = 'public-resolver'
func.tags = ['PublicResolverFacet']
func.dependencies = []

export default func
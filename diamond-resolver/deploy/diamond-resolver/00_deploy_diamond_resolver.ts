import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deploy } = deployments
  const { deployer, owner } = await getNamedAccounts()

  const registry = await ethers.getContract('ENSRegistry', owner)
  const nameWrapper = await ethers.getContract('OptiDomains', owner)

  const registryDeployArgs = {
    from: deployer,
    args: [
      registry.address,
    ],
    log: true,
  }

  const nameWrapperRegistryDeployment = await deploy('NameWrapperRegistry', registryDeployArgs)
  if (!nameWrapperRegistryDeployment.newlyDeployed) return

  const attestationDeployArgs = {
    from: deployer,
    args: [
      nameWrapperRegistryDeployment.address,
      '0xEE36eaaD94d1Cc1d0eccaDb55C38bFfB6Be06C77'
    ],
    log: true,
  }

  const optiDomainsAttestation = await deploy('OptiDomainsAttestation', attestationDeployArgs)

  const deployArgs = {
    from: deployer,
    args: [
      deployer,
      nameWrapperRegistryDeployment.address,
    ],
    log: true,
  }

  const resolverDeployment = await deploy('DiamondResolver', deployArgs)
  if (!resolverDeployment.newlyDeployed) return

  const nameWrapperRegistry = await ethers.getContract('NameWrapperRegistry', owner)
  const diamondResolver = await ethers.getContract('DiamondResolver', owner)

  await (await nameWrapperRegistry.upgrade('0x0000000000000000000000000000000000000000', nameWrapper.address)).wait()
  await (await nameWrapperRegistry.setAttestation(optiDomainsAttestation.address)).wait()
}

func.id = 'diamond-resolver'
func.tags = ['DiamondResolver']
func.dependencies = []

export default func
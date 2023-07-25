import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

async function main() {
  // function setEarthKyc(bytes32 node, bytes32 kycHash) external;
  // function earthKyc(bytes32 node) external view returns(bytes32);

  const DiamondResolver = await ethers.getContractFactory("DiamondResolver");
  const diamondResolver = await DiamondResolver.attach("0xc8C033028a3353F5FFE6A873A2805a131ED00d1f");

  const selectors = [
    ethers.utils.id("setEarthKyc(bytes32,bytes32)").substring(0, 10),
    ethers.utils.id("earthKyc(bytes32)").substring(0, 10),
  ]

  const facetCut = {
    target: "0x838Ea9a64EA1C57F311bD2e7Aa649C0d6984c1eB",
    action: 0, // ADD
    selectors: selectors
  }

  const supportInterfaces: string[] = [
    // "0x25f36704", // IDiamondResolverAuth
  ]

  const tx1 = await diamondResolver.diamondCut(
    [facetCut],
    "0x0000000000000000000000000000000000000000",
    // diamondResolver.address, 
    "0x",
    // diamondResolver.interface.encodeFunctionData(
    //   "setMultiSupportsInterface",
    //   [
    //     supportInterfaces,
    //     true,
    //   ]
    // ),
  )

  await tx1.wait()

  console.log("Success")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
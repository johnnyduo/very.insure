//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IInsuranceMasterchef {
  function distributeReward(IERC20 token, uint256 amount) external;
  function increaseShare(address target, uint256 amount) external;
  function decreaseShare(address target, uint256 amount) external;
}
//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "./InsuranceConstants.sol";
import "./interfaces/IInsuranceMasterchef.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

interface IInsurancePoolSubset {
    function isTrustedProxy(address _proxy) external view returns (bool);
}

contract InsuranceMasterchef is Initializable, IInsuranceMasterchef {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    address public insurancePool;

    EnumerableSet.AddressSet private assets;
    mapping(IERC20 => uint256) public totalAssets;
    mapping(IERC20 => uint256) public accRewardPerShare;
    mapping(address => uint256) public shares;
    mapping(IERC20 => mapping(address => uint256)) public debt;

    uint256 public totalShares;

    modifier onlyInsurancePool {
        require(msg.sender == insurancePool, "Not insurance pool");
        _;
    }

    function initialize(address _insurancePool) public initializer {
        insurancePool = _insurancePool;
    }

    function _updateDebt(IERC20 token, address target) internal {
        if (totalShares > 0) {
            debt[token][target] = (accRewardPerShare[token] * shares[target]) / 1e18;
        } else {
            debt[token][target] = 0;
        }
    }

    function _updateDebt(address target) internal {
        uint256 assetsLength = assets.length();
        for (uint256 i; i < assetsLength;) {
            _updateDebt(IERC20(assets.at(i)), target);

            unchecked {
                ++i;
            }
        }
    }

    event Harvest(
        address indexed harvester,
        address indexed token,
        address indexed target,
        uint256 amount
    );

    function harvest(IERC20 token, address target) public {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 balance = shares[target];
        if (balance == 0 || totalShares == 0 || target == address(0)) return;

        uint256 totalToWithdraw = (accRewardPerShare[token] * balance) / 1e18;

        if (debt[token][target] >= totalToWithdraw) {
            debt[token][target] = totalToWithdraw;
            return;
        }

        if (currentBalance == 0) {
            revert PoolDrained();
        }

        uint256 amountToWithdraw = totalToWithdraw - debt[token][target];

        if (amountToWithdraw > currentBalance) {
            token.safeTransfer(target, currentBalance);
        } else {
            token.safeTransfer(target, amountToWithdraw);
        }

        debt[token][target] = totalToWithdraw;

        emit Harvest(msg.sender, address(token), target, amountToWithdraw);
    }

    function harvestAll(address target) public {
        uint256 assetsLength = assets.length();
        for (uint256 i; i < assetsLength;) {
            harvest(IERC20(assets.at(i)), target);

            unchecked {
                ++i;
            }
        }
    }

    event DistributeReward(address indexed distributor, address indexed token, uint256 amount, uint256 totalAmount);
    function distributeReward(IERC20 token, uint256 amount) public {
        if (!assets.contains(address(token))) {
            if (assets.length() >= MAX_MASTERCHEF_ASSETS) revert TooManyAssets();

            if (msg.sender == insurancePool || IInsurancePoolSubset(insurancePool).isTrustedProxy(msg.sender)) {
                assets.add(address(token));
                totalAssets[token] = 0;
            } else {
                revert AssetNotAllowed(address(token));
            }
        }

        if (totalShares > 0) {
            token.safeTransferFrom(msg.sender, address(this), amount);
            totalAssets[token] += amount;
            accRewardPerShare[token] += amount * 1e18 / totalShares;
            emit DistributeReward(msg.sender, address(token), amount, totalAssets[token]);
        }
    }

    event ShareUpdated(address indexed updator, address indexed target, int256 amount, uint256 totalShare);
    function increaseShare(address target, uint256 amount) public onlyInsurancePool {
        harvestAll(target);
        shares[target] += amount;
        totalShares += amount;
        _updateDebt(target);
        emit ShareUpdated(msg.sender, target, int256(amount), shares[target]);
    }

    function decreaseShare(address target, uint256 amount) public onlyInsurancePool {
        harvestAll(target);
        shares[target] -= amount;
        totalShares -= amount;
        _updateDebt(target);
        emit ShareUpdated(msg.sender, target, -int256(amount), shares[target]);
    }

    function pendingReward(address target, IERC20 token) public view returns(uint256) {
        uint256 balance = shares[target];
        if (balance == 0 || totalShares == 0 || target == address(0)) return 0;
        uint256 totalToWithdraw = (accRewardPerShare[token] * balance) / 1e18;
        return debt[token][target] >= totalToWithdraw ? 0 : totalToWithdraw - debt[token][target];
    }
}

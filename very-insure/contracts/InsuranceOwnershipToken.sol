//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "./InsuranceConstants.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./interfaces/IInsuranceRegistrar.sol";

contract InsuranceOwnershipToken is Initializable, ERC20 {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    bytes32 public ownerNode;
    IInsuranceRegistrar public registrar;

    EnumerableSet.AddressSet private assets;
    mapping(IERC20 => uint256) public total;
    mapping(IERC20 => uint256) public accRewardPerShare;
    mapping(IERC20 => mapping(address => uint256)) public debt;

    string private _nameOverride;
    string private _symbolOverride;

    constructor() ERC20("", "") {}

    // There are only 10000 ether shares
    function initialize(
        bytes32 _ownerNode,
        string memory _name,
        string memory _symbol
    ) public initializer {
        registrar = IInsuranceRegistrar(msg.sender);
        _mint(registrar.registry().ownerOf(_ownerNode), 10000 ether);

        _nameOverride = _name;
        _symbolOverride = _symbol;
    }

    function name() public view virtual override(ERC20) returns(string memory) {
        return _nameOverride;
    }

    function symbol() public view virtual override(ERC20) returns(string memory) {
        return _symbolOverride;
    }

    function _updateDebt(IERC20 token, address target) internal {
        debt[token][target] = accRewardPerShare[token] * balanceOf(target) / 1e18;
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

    event Harvest(address indexed harvester, address indexed token, address indexed target, uint256 amount);
    function harvest(IERC20 token, address target) public {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalToWithdraw = accRewardPerShare[token] * balanceOf(target) / 1e18;

        if (debt[token][target] >= totalToWithdraw) {
            debt[token][target] = totalToWithdraw;
            return;
        }

        if (currentBalance == 0) {
            revert PoolDrained();
        }

        uint256 amountToWithdraw = totalToWithdraw - debt[token][target];

        // For safety
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

    event Distribute(address indexed distributor, address indexed token, uint256 amount, uint256 totalAmount);
    function distribute(IERC20 token, uint256 amount) public {
        if (!assets.contains(address(token))) {
            if (assets.length() >= MAX_MASTERCHEF_ASSETS) revert TooManyAssets();

            if (msg.sender == address(registrar) || registrar.isAuthorised(msg.sender, ownerNode, ROLE_NEW_OWNERSHIP_REWARD_TOKEN)) {
                assets.add(address(token));
            } else {
                revert AssetNotAllowed(address(token));
            }
        }
        
        token.safeTransferFrom(msg.sender, address(this), amount);
        total[token] += amount;
        accRewardPerShare[token] += amount * 1e18 / totalSupply();
        emit Distribute(msg.sender, address(token), amount, total[token]);
    }

    function _update(address from, address to, uint256 amount) internal virtual override {
        if (from != address(0)) {
            harvestAll(from);
        }

        if (to != address(0)) {
            harvestAll(to);
        }

        super._update(from, to, amount);
    }

    function pendingReward(address target, IERC20 token) public view returns(uint256) {
        uint256 totalToWithdraw = (accRewardPerShare[token] * balanceOf(target)) / 1e18;
        return debt[token][target] >= totalToWithdraw ? 0 : totalToWithdraw - debt[token][target];
    }
}

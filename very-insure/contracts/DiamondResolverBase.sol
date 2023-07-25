// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC165BaseInternal} from "@solidstate/contracts/introspection/ERC165/base/ERC165BaseInternal.sol";
import {ENS} from "./interfaces/ENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import "./interfaces/IDiamondResolverBase.sol";
import "./interfaces/IDiamondResolverFactory.sol";
import "./DiamondResolverUtil.sol";

interface IDiamondResolverInitialize {
    function initialize(address _owner, address _fallback) external;
}

error ERC165Base__InvalidInterfaceId();

abstract contract DiamondResolverBaseInternal is DiamondResolverUtil {
    // Logged when an operator is added or removed.
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    // Logged when a delegate is approved or an approval is revoked.
    event Approved(
        address owner,
        bytes32 indexed node,
        address indexed delegate,
        bool indexed approved
    );

    /**
     * @dev See {IERC1155-setApprovalForAll}.
     */
    function _setApprovalForAll(address operator, bool approved) internal {
        require(
            msg.sender != operator,
            "ERC1155: setting approval status for self"
        );

        DiamondResolverBaseStorage.Layout storage l = DiamondResolverBaseStorage
            .layout();
        l.operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev Approve a delegate to be able to updated records on a node.
     */
    function _approve(bytes32 node, address delegate, bool approved) internal {
        require(msg.sender != delegate, "Setting delegate status for self");

        DiamondResolverBaseStorage.Layout storage l = DiamondResolverBaseStorage
            .layout();
        l.tokenApprovals[msg.sender][node][delegate] = approved;
        emit Approved(msg.sender, node, delegate, approved);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function _isApprovedForAll(
        address account,
        address operator
    ) internal view returns (bool) {
        DiamondResolverBaseStorage.Layout storage l = DiamondResolverBaseStorage
            .layout();
        return l.operatorApprovals[account][operator];
    }

    /**
     * @dev Check to see if the delegate has been approved by the owner for the node.
     */
    function _isApprovedFor(
        address owner,
        bytes32 node,
        address delegate
    ) internal view returns (bool) {
        DiamondResolverBaseStorage.Layout storage l = DiamondResolverBaseStorage
            .layout();
        return l.tokenApprovals[owner][node][delegate];
    }
}

contract DiamondResolverFactory is IDiamondResolverFactory {
    event CloneDiamondResolver(address indexed cloner, address indexed resolver);

    /**
     * @dev Modifier to ensure that the first 20 bytes of a submitted salt match
     * those of the calling account. This provides protection against the salt
     * being stolen by frontrunners or other attackers.
     * @param salt bytes32 The salt value to check against the calling address.
     */
    modifier containsCaller(bytes32 salt) {
        // prevent contract submissions from being stolen from tx.pool by requiring
        // that the first 20 bytes of the submitted salt match msg.sender.
        require(
            (address(bytes20(salt)) == msg.sender),
            "Invalid salt - first 20 bytes of the salt must match calling address."
        );
        _;
    }

    /**
     * Clone DiamondResolver to customize your own resolver
     */
    function clone(bytes32 salt) public containsCaller(salt) {
        address newResolver = Clones.cloneDeterministic(address(this), salt);
        IDiamondResolverInitialize(newResolver).initialize(msg.sender, address(this));
        emit CloneDiamondResolver(msg.sender, newResolver);
    }
}

abstract contract DiamondResolverBase is
    IDiamondResolverBase,
    DiamondResolverBaseInternal,
    DiamondResolverFactory,
    ERC165BaseInternal
{
    /**
     * @dev See {IERC1155-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved) public {
        _setApprovalForAll(operator, approved);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(
        address account,
        address operator
    ) public view returns (bool) {
        return _isApprovedForAll(account, operator);
    }

    /**
     * @dev Approve a delegate to be able to updated records on a node.
     */
    function approve(bytes32 node, address delegate, bool approved) public {
        _approve(node, delegate, approved);
    }

    /**
     * @dev Check to see if the delegate has been approved by the owner for the node.
     */
    function isApprovedFor(
        address owner,
        bytes32 node,
        address delegate
    ) public view returns (bool) {
        return _isApprovedFor(owner, node, delegate);
    }

    function recordVersions(bytes32 node) public view returns (uint64) {
        return _recordVersions(node);
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function clearRecords(bytes32 node) public virtual authorised(node) {
        _clearRecords(node);
    }

    function setSupportsInterface(bytes4 interfaceId, bool status) public baseOnlyOwner {
        _setSupportsInterface(interfaceId, status);
    }

    function setMultiSupportsInterface(bytes4[] memory interfaceId, bool status) public baseOnlyOwner {
        unchecked {
            uint length = interfaceId.length;
            for (uint i; i < length; ++i) {
                _setSupportsInterface(interfaceId[i], status);
            }
        }
    }
}

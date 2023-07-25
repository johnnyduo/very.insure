//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import "./SolidStateDiamond.sol";
import "./interfaces/IDiamondResolver.sol";
import "./DiamondResolverBase.sol";
import "./interfaces/ENS.sol";
import "./interfaces/INameWrapperRegistry.sol";
import {IReverseRegistrar} from "./interfaces/IReverseRegistrar.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";

bytes4 constant supportsInterfaceSignature = 0x01ffc9a7;

abstract contract Multicallable is IMulticallable, IERC165 {
    function _multicall(
        bytes32 nodehash,
        bytes[] calldata data
    ) internal returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            if (nodehash != bytes32(0)) {
                bytes32 txNamehash = bytes32(data[i][4:36]);
                require(
                    txNamehash == nodehash,
                    "multicall: All records must have a matching namehash"
                );
            }
            (bool success, bytes memory result) = address(this).delegatecall(
                data[i]
            );
            require(success);
            results[i] = result;
        }
        return results;
    }

    // This function provides an extra security check when called
    // from priviledged contracts (such as EthRegistrarController)
    // that can set records on behalf of the node owners
    function multicallWithNodeCheck(
        bytes32 nodehash,
        bytes[] calldata data
    ) external returns (bytes[] memory results) {
        return _multicall(nodehash, data);
    }

    function multicall(
        bytes[] calldata data
    ) public override returns (bytes[] memory results) {
        return _multicall(bytes32(0), data);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(IERC165) returns (bool) {
        return interfaceID == type(IMulticallable).interfaceId;
    }
}

contract DiamondResolver is 
    SolidStateDiamond,
    Multicallable,
    DiamondResolverBase
{
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    INameWrapperRegistry public immutable registry;

    constructor(address _owner, INameWrapperRegistry _registry) SolidStateDiamond(_owner) {
        registry = _registry;
    }

    function initialize(address _owner, address _fallback) public virtual override {
        super.initialize(_owner, _fallback);

        if (_fallback == address(0)) {
            bytes4[] memory selectors = new bytes4[](8);
            uint256 selectorIndex;

            // register DiamondResolverBase

            selectors[selectorIndex++] = IHasNameWrapperRegistry.registry.selector;
            selectors[selectorIndex++] = IDiamondResolverBase.setApprovalForAll.selector;
            selectors[selectorIndex++] = IDiamondResolverBase.isApprovedForAll.selector;
            selectors[selectorIndex++] = IDiamondResolverBase.approve.selector;
            selectors[selectorIndex++] = IDiamondResolverBase.isApprovedFor.selector;
            selectors[selectorIndex++] = IVersionableResolver.recordVersions.selector;
            selectors[selectorIndex++] = IVersionableResolver.clearRecords.selector;
            selectors[selectorIndex++] = IDiamondResolverFactory.clone.selector;

            // diamond cut

            FacetCut[] memory facetCuts = new FacetCut[](1);

            facetCuts[0] = FacetCut({
                target: address(this),
                action: FacetCutAction.ADD,
                selectors: selectors
            });

            _diamondCut(facetCuts, address(0), '');
        }

        _setSupportsInterface(type(IDiamondResolver).interfaceId, true);
        _setSupportsInterface(type(IVersionableResolver).interfaceId, true);
        _setSupportsInterface(type(IHasNameWrapperRegistry).interfaceId, true);
        _setSupportsInterface(type(IDiamondResolverFactory).interfaceId, true);
    }

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        virtual
        override(Multicallable, SolidStateDiamond)
        returns (bool)
    {
        return SolidStateDiamond.supportsInterface(interfaceID) || Multicallable.supportsInterface(interfaceID);
    }
}

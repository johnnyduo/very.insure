//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {OwnableStorage} from "@solidstate/contracts/access/ownable/OwnableStorage.sol";
import "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";
import "./IOptiDomainsAttestation.sol";

error NotDiamondOwner();

contract OptiDomainsAttestationDiamond is SolidStateDiamond {
    modifier baseOnlyOwner() {
        if (msg.sender != OwnableStorage.layout().owner) revert NotDiamondOwner();
        _;
    }

    constructor(address _owner, address _facet) {
        {
            bytes4[] memory selectors = new bytes4[](22);
            
            selectors[0] = bytes4(0x7b103999);
            selectors[1] = bytes4(0x6912e70e);
            selectors[2] = bytes4(0x8150864d);
            selectors[3] = bytes4(0xcf9dbeb7);
            selectors[4] = bytes4(0x01e64725);

            selectors[5] = bytes4(0x78c87e5f);

            selectors[6] = bytes4(0x56c82d6b);
            selectors[7] = bytes4(0xcb81facd); 
            selectors[8] = bytes4(0x8a6f7fe6);
            selectors[9] = bytes4(0xf806f52a);
            selectors[10] = bytes4(0x3e57d269);
            selectors[11] = bytes4(0x4ac4f681);
            selectors[12] = bytes4(0x6aec6216);
            selectors[13] = bytes4(0x274ac54a);
            selectors[14] = bytes4(0x4a91b882);
            selectors[15] = bytes4(0x2d4d6ccf);
            selectors[16] = bytes4(0xeff94ac7);

            selectors[17] = bytes4(0xfc031b75);
            selectors[18] = bytes4(0x9acb0417);
            selectors[19] = bytes4(0x0e0ffb66);
            selectors[20] = bytes4(0x2a9c71ec);
            selectors[21] = bytes4(0xd7561abd);

            FacetCut[] memory facetCuts = new FacetCut[](1);

            facetCuts[0] = FacetCut({
                target: _facet,
                action: FacetCutAction.ADD,
                selectors: selectors
            });

            _diamondCut(facetCuts, address(0), '');

            _setSupportsInterface(type(IOptiDomainsAttestation).interfaceId, true);
        }

        _setOwner(_owner);
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
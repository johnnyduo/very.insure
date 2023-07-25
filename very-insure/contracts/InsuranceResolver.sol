// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import {IERC165} from "@solidstate/contracts/interfaces/IERC165.sol";
import {DiamondResolverBaseInternal} from "./DiamondResolverBase.sol";
import "./DiamondResolverUtil.sol";
import "./interfaces/IAddrResolver.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/INameResolver.sol";
import "./interfaces/ITextResolver.sol";
import "./interfaces/IKycResolver.sol";
import "./interfaces/IDiamondResolverAuth.sol";

bytes32 constant ADDR_RESOLVER_SCHEMA = keccak256(abi.encodePacked("bytes32 node,uint256 coinType,bytes address", address(0), true));
bytes32 constant NAME_RESOLVER_SCHEMA = keccak256(abi.encodePacked("bytes32 node,string name", address(0), true));
bytes32 constant TEXT_RESOLVER_SCHEMA = keccak256(abi.encodePacked("bytes32 node,string key,string value", address(0), true));

bytes32 constant KYC_RESOLVER_SCHEMA = keccak256(abi.encodePacked("bytes32 node,bytes32 kycProvider", address(0), true));

abstract contract AddrResolver is
    IAddrResolver,
    IAddressResolver,
    DiamondResolverUtil,
    IERC165
{
    uint256 private constant COIN_TYPE_ETH = 60;

    function setAddr(
        bytes32 node,
        address a
    ) external virtual authorised(node) {
        setAddr(node, COIN_TYPE_ETH, addressToBytes(a));
    }

    function addr(
        bytes32 node
    ) public view virtual override returns (address payable) {
        bytes memory a = addr(node, COIN_TYPE_ETH);
        if (a.length == 0) {
            return payable(0);
        }
        return bytesToAddress(a);
    }

    function setAddrWithRef(
        bytes32 node,
        uint256 coinType,
        bytes32 ref,
        bytes memory a
    ) public virtual authorised(node) {
        emit AddressChanged(node, coinType, a);
        if (coinType == COIN_TYPE_ETH) {
            emit AddrChanged(node, bytesToAddress(a));
        }

        _attest(
            ADDR_RESOLVER_SCHEMA,
            bytes32(coinType),
            ref,
            abi.encode(node, coinType, a)
        );
    }

    function setAddr(
        bytes32 node,
        uint256 coinType,
        bytes memory a
    ) public virtual {
        setAddrWithRef(node, coinType, bytes32(0), a);
    }

    function addr(
        bytes32 node,
        uint256 coinType
    ) public view virtual override returns (bytes memory) {
        bytes memory response = _readAttestation(
            node,
            ADDR_RESOLVER_SCHEMA,
            bytes32(coinType)
        );
        if (response.length == 0) return "";
        (, , bytes memory a) = abi.decode(response, (bytes32, bytes32, bytes));
        return a;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return
            interfaceID == type(IAddrResolver).interfaceId ||
            interfaceID == type(IAddressResolver).interfaceId;
    }

    function bytesToAddress(
        bytes memory b
    ) internal pure returns (address payable a) {
        require(b.length == 20);
        assembly {
            a := div(mload(add(b, 32)), exp(256, 12))
        }
    }

    function addressToBytes(address a) internal pure returns (bytes memory b) {
        b = new bytes(20);
        assembly {
            mstore(add(b, 32), mul(a, exp(256, 12)))
        }
    }
}

abstract contract NameResolver is INameResolver, DiamondResolverUtil, IERC165 {
    function setName(
        bytes32 node,
        string calldata newName
    ) external virtual authorised(node) {
        _attest(NAME_RESOLVER_SCHEMA, bytes32(0), abi.encode(node, newName));
        emit NameChanged(node, newName);
    }

    function name(
        bytes32 node
    ) external view virtual override returns (string memory result) {
        bytes memory response = _readAttestation(node, NAME_RESOLVER_SCHEMA, bytes32(0));
        if (response.length == 0) return "";
        (, result) = abi.decode(response, (bytes32, string));
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return
            interfaceID == type(INameResolver).interfaceId;
    }
}

abstract contract TextResolver is ITextResolver, DiamondResolverUtil, IERC165 {
    function setTextWithRef(
        bytes32 node,
        bytes32 ref,
        string calldata key,
        string calldata value
    ) public virtual authorised(node) {
        _attest(TEXT_RESOLVER_SCHEMA, keccak256(abi.encodePacked(key)), ref, abi.encode(node, key, value));
        emit TextChanged(node, key, key, value);
    }

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external virtual {
        setTextWithRef(node, bytes32(0), key, value);
    }

    function text(
        bytes32 node,
        string calldata key
    ) external view virtual override returns (string memory result) {
        bytes memory response = _readAttestation(node, TEXT_RESOLVER_SCHEMA, keccak256(abi.encodePacked(key)));
        if (response.length == 0) return "";
        (,, result) = abi.decode(response, (bytes32, string, string));
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return
            interfaceID == type(ITextResolver).interfaceId;
    }
}

contract RegistryAuthFacet is DiamondResolverBaseInternal, IDiamondResolverAuth {
    function isAuthorised(address sender, bytes32 node) public virtual view returns (bool) {
        address owner = IHasNameWrapperRegistry(address(this)).registry().ownerOf(node);

        return
            owner == sender ||
            _isApprovedForAll(owner, sender) ||
            _isApprovedFor(owner, node, sender);
    }
}

contract InsuranceMinimalResolver is AddrResolver, NameResolver, TextResolver, RegistryAuthFacet {
    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        override(
            AddrResolver,
            NameResolver,
            TextResolver
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceID) || interfaceID == type(IDiamondResolverAuth).interfaceId;
    }
}

contract InsuranceKycResolver is IKycResolver, DiamondResolverUtil, IERC165 {
    error KycExpired();
    error KycInvalid();

    function kyc(bytes32 node, bytes32 provider) public view virtual override returns (bytes32, bytes32, uint256) {
        Attestation memory attestation = _attestation().readRef(node, KYC_RESOLVER_SCHEMA, provider, false);

        // Expired
        if (attestation.expirationTime > 0 && attestation.expirationTime < block.timestamp) {
            revert KycExpired();
        }

        (bytes32 _node, bytes32 _provider, bytes32 _identity) = abi.decode(attestation.data, (bytes32, bytes32, bytes32));

        // Invalid data
        if (
            node != _node ||
            provider != _provider ||
            _identity == bytes32(0) ||
            attestation.attester != _registry().ownerOf(provider) ||
            attestation.recipient != _registry().ownerOf(node) ||
            attestation.revocationTime != 0
        ) {
            revert KycInvalid();
        }

        return (attestation.uid, _identity, attestation.expirationTime);
    }
    
    function provideKyc(bytes32 node, bytes32 provider, bytes32 ref) public virtual authorised(provider) {
        _attest(KYC_RESOLVER_SCHEMA, provider, ref, abi.encode(node, provider));
        (bytes32 _ref, bytes32 identity, uint256 expiration) = kyc(node, provider);
        if (_ref == bytes32(0) || ref != _ref) {
            revert KycInvalid();
        }
        emit KycProvided(node, provider, identity, ref, expiration);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return
            interfaceID == type(IKycResolver).interfaceId;
    }
}

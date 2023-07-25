// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./OptiDomainsAttestation.sol";
import "./IOptiDomainsSocialOracle.sol";

// To save gas deploying resolver
import "../diamond-resolver/facets/social-oracle/OptiDomainsSocialOracleResolver.sol";

error InvalidOperatorSignature();
error DigestAttested(bytes32 digest);

bytes32 constant KECCAK256_ATTEST = keccak256("attest");
bytes32 constant KECCAK256_REVOKE = keccak256("revoke");

contract OptiDomainsSocialOracle is IOptiDomainsSocialOracle, OptiDomainsSocialOracleResolver {
    address public immutable operator;
    OptiDomainsAttestation public immutable attestation;

    mapping(bytes32 => bool) public attested;

    constructor(address _operator, OptiDomainsAttestation _attestation) {
        operator = _operator;
        attestation = _attestation;
    }

    function attest(
        bytes32 schema,
        bytes calldata data,
        bytes calldata operatorSignature
    ) public returns(bytes32) {
        bytes32 node = abi.decode(data, (bytes32));
        bytes32 digest = keccak256(data);

        if (attested[digest]) {
            revert DigestAttested(digest);
        }

        if (
            !SignatureChecker.isValidSignatureNow(
                operator,
                keccak256(
                    abi.encodePacked(
                        bytes1(0x19),
                        bytes1(0),
                        address(this),
                        uint256(block.chainid),
                        KECCAK256_ATTEST,
                        schema,
                        digest
                    )
                ),
                operatorSignature
            )
        ) {
            revert InvalidOperatorSignature();
        }

        attested[digest] = true;

        return attestation.eas().attest(
            AttestationRequest({
                schema: schema,
                data: AttestationRequestData({
                    recipient: attestation.registry().ownerOf(node),
                    expirationTime: 0,
                    revocable: true,
                    refUID: bytes32(0),
                    data: data,
                    value: 0
                })
            })
        );
    }

    function revoke(bytes32 schema, bytes32 uid, bytes calldata operatorSignature) public {
        if (
            !SignatureChecker.isValidSignatureNow(
                operator,
                keccak256(
                    abi.encodePacked(
                        bytes1(0x19),
                        bytes1(0),
                        address(this),
                        uint256(block.chainid),
                        KECCAK256_REVOKE,
                        schema,
                        uid
                    )
                ),
                operatorSignature
            )
        ) {
            revert InvalidOperatorSignature();
        }

        attestation.eas().revoke(
            RevocationRequest({
                schema: schema,
                data: RevocationRequestData({uid: uid, value: 0})
            })
        );
    }
}

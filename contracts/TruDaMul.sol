// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../node_modules/@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @dev {MainSmartContract}
 *
 */
contract TruDaMul {
    // Sender address, i.e. the owner
    address _sender;

    // Token used for payments
    IERC20 public _token;

    // Amount of tokens reserved for open tender offers
    uint256 public _openTendersOffers;

    // Tenders data structure
    mapping(uint256 => Tender) tenders;
    uint256 tendersNum;
    struct Tender {
        bool open;
        bytes eID;
        uint256 senderOffer;
        uint256 idx;
        bytes pURI;
        uint256 muleRequest;
    }
    event TenderAnnouncement(
        bytes indexed eID,
        uint256 senderOffer,
        uint256 idx,
        bytes indexed pURI,
        uint256 muleRequest
    );

    // Mule Payments data structure
    mapping(address => MulePayments) mulePayments;
    struct MulePayments {
        mapping(uint256 => Payment) payments;
        uint256 paymentsNum;
    }
    struct Payment {
        bytes eID;
        bool paid;
    }

    event Debug(bytes32 indexed deb);

    constructor(address tokenAddress, address sender) {
        require(tokenAddress != address(0), "TruDaMul: Invalid token address");
        _token = IERC20(tokenAddress);
        _sender = sender;
    }

    function muleTenderAnnouncement(
        bytes memory eID,
        uint256 senderOffer,
        uint256 idx,
        bytes memory pURI,
        bytes memory senderSignature,
        uint256 muleRequest
    ) public {
        require(
            _token.balanceOf(address(this)) - _openTendersOffers >= senderOffer,
            "TruDaMul: Insufficient balance"
        );
        address extractedSender = extractTenderSignature(
            eID,
            senderOffer,
            idx,
            pURI,
            senderSignature
        );

        require(_sender == extractedSender, "TruDaMul: Invalid signature");
        //TODO: check valid mule address (e.g. sender signature)

        Tender storage t = tenders[tendersNum++];
        t.open = true;
        t.eID = eID;
        t.senderOffer = senderOffer;
        t.idx = idx;
        t.pURI = pURI;
        t.muleRequest = muleRequest;

        MulePayments storage p = mulePayments[msg.sender];
        p.payments[p.paymentsNum++].eID = eID;

        _openTendersOffers += senderOffer;

        emit TenderAnnouncement(eID, senderOffer, idx, pURI, muleRequest);
    }

    /**
     * @notice Returns the address extracted from the tender signature.
     * @return Address of the tender signer.
     */
    function extractTenderSignature(
        bytes memory eID,
        uint256 senderOffer,
        uint256 idx,
        bytes memory pURI,
        bytes memory senderSignature
    ) public pure returns (address) {
        // Compute message hash
        bytes32 hash = keccak256(abi.encodePacked(eID, senderOffer, idx, pURI));

        // Derive address from signature
        return
            ECDSA.recover(ECDSA.toEthSignedMessageHash(hash), senderSignature);
    }

    function checkMulePayment(address mule, bytes memory eID)
        public
        view
        returns (bool)
    {
        MulePayments storage p = mulePayments[mule];
        bool flag = false;
        for (uint256 i = 0; i < p.paymentsNum && !flag; i++) {
            if (p.payments[i].paid == false) return false;
            if (
                keccak256(abi.encodePacked(p.payments[i].eID)) ==
                keccak256(abi.encodePacked(eID))
            ) flag = true;
        }
        return flag;
    }

    function setPaidTemp(address mule, bytes memory eID) public {
        MulePayments storage p = mulePayments[mule];
        for (uint256 i = 0; i < p.paymentsNum; i++) {
            if (
                keccak256(abi.encodePacked(p.payments[i].eID)) ==
                keccak256(abi.encodePacked(eID))
            ) {
                p.payments[i].paid = true;
                return;
            }
        }
    }
}

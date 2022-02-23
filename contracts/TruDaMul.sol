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

    // Grace period (in ms) for tenders before authorized address can be modified
    uint256 public _tenderGracePeriod;

    // Tenders data structure
    mapping(bytes => uint256) tendersByexID;
    mapping(uint256 => Tender) tenders;
    uint256 tendersNum;
    struct Tender {
        uint256 gracePeriodEnd;
        bool fulfilled;
        bytes exID;
        uint256 senderOffer;
        uint256 idx;
        bytes pURI;
        address authorized;
    }
    event TenderAnnouncement(
        uint256 gracePeriodEnd,
        bytes indexed exID,
        uint256 senderOffer,
        uint256 idx,
        bytes indexed pURI,
        address authorized
    );

    // Mule Payments data structure
    mapping(address => MulePayments) mulePayments;
    struct MulePayments {
        mapping(bytes => uint256) paymentsByexID;
        mapping(uint256 => Payment) payments;
        uint256 paymentsNum;
    }
    struct Payment {
        bytes exID;
        bool paid;
    }

    event Debug(bytes indexed deb);

    constructor(address tokenAddress, address sender) {
        require(tokenAddress != address(0), "TruDaMul: Invalid token address");
        _token = IERC20(tokenAddress);
        _sender = sender;
        _tenderGracePeriod = 600000;
    }

    function submitTender(
        uint256 chainID,
        bytes memory exID,
        bytes memory pPayID,
        uint256 senderOffer,
        uint256 idx,
        bytes memory pURI,
        address mule,
        bytes memory balanceProofHash,
        bytes memory senderTenderSignature,
        address authorized
    ) public {
        // Tender signature check
        address extractedSender = extractTenderSignature(
            address(this),
            chainID,
            exID,
            pPayID,
            senderOffer,
            idx,
            pURI,
            mule,
            balanceProofHash,
            senderTenderSignature
        );
        require(_sender == extractedSender, "TruDaMul: Invalid signature");

        // Allow mule state channel payment
        _allowMulePayment(mule, exID);

        // Check balance
        if (
            _token.balanceOf(address(this)) - _openTendersOffers < senderOffer
        ) {
            return;
        } else {
            tendersByexID[exID] = ++tendersNum;
            Tender storage t = tenders[tendersNum];
            t.gracePeriodEnd = block.timestamp + _tenderGracePeriod;
            t.exID = exID;
            t.senderOffer = senderOffer;
            t.idx = idx;
            t.pURI = pURI;
            t.authorized = authorized;

            _openTendersOffers += senderOffer;

            emit TenderAnnouncement(
                t.gracePeriodEnd,
                exID,
                senderOffer,
                idx,
                pURI,
                authorized
            );
        }
    }

    function submitPayment(
        bytes memory exID,
        address mule,
        bytes memory pPayID,
        bytes memory senderSignature
    ) public {
        uint256 exIDIndex = tendersByexID[exID];
        require(exIDIndex > 0, "TruDaMul: Invalid exID");

        bool flag;

        // Payments signature check
        address extractedSender = extractPaymentsSignature(
            exID,
            mule,
            pPayID,
            senderSignature
        );
        if (_sender != extractedSender) {
            // Mule address signature check
            address extractedSender2 = extractMuleSignature(
                mule,
                senderSignature
            );
            require(_sender == extractedSender2, "TruDaMul: Invalid signature");
            flag = true;
        }

        Tender storage t = tenders[exIDIndex];
        if (!flag) {
            // Pay proxy
            _token.transfer(t.authorized, t.senderOffer);
        }
        _openTendersOffers -= t.senderOffer;
        t.fulfilled = true;

        // Allow mule state channel payment
        _allowMulePayment(mule, exID);
    }

    /**
     * @notice Returns the address extracted from the tender signature.
     * @return Address of the tender signer.
     */
    function extractTenderSignature(
        address scAddress,
        uint256 chainID,
        bytes memory exID,
        bytes memory pPayID,
        uint256 senderOffer,
        uint256 idx,
        bytes memory pURI,
        address mule,
        bytes memory balanceProofHash,
        bytes memory senderTenderSignature
    ) public pure returns (address) {
        // Compute message hash
        bytes32 hash = keccak256(
            abi.encodePacked(
                scAddress,
                chainID,
                exID,
                pPayID,
                senderOffer,
                idx,
                pURI,
                mule,
                balanceProofHash
            )
        );

        // Derive address from signature
        return
            ECDSA.recover(
                ECDSA.toEthSignedMessageHash(hash),
                senderTenderSignature
            );
    }

    /**
     * @notice Returns the address extracted from the mule address signature.
     * @return Address of the mule address signer.
     */
    function extractMuleSignature(address mule, bytes memory senderSignature)
        public
        pure
        returns (address)
    {
        // Compute message hash
        bytes32 hash = keccak256(abi.encodePacked(mule));

        // Derive address from signature
        return
            ECDSA.recover(ECDSA.toEthSignedMessageHash(hash), senderSignature);
    }

    /**
     * @notice Returns the address extracted from payments signature.
     * @return Address of the payments signer.
     */
    function extractPaymentsSignature(
        bytes memory exID,
        address mule,
        bytes memory pPayID,
        bytes memory senderSignature
    ) public pure returns (address) {
        // Compute message hash
        bytes32 hash = keccak256(abi.encodePacked(exID, mule, pPayID));

        // Derive address from signature
        return
            ECDSA.recover(ECDSA.toEthSignedMessageHash(hash), senderSignature);
    }

    function _allowMulePayment(address mule, bytes memory exID) private {
        MulePayments storage p = mulePayments[mule];
        if (p.paymentsByexID[exID] == 0) {
            p.paymentsByexID[exID] = ++p.paymentsNum;
            p.payments[p.paymentsNum].exID = exID;
        }
        p.payments[p.paymentsByexID[exID]].paid = true;
    }

    function checkMulePayment(address mule, bytes memory exID)
        public
        view
        returns (bool)
    {
        MulePayments storage p = mulePayments[mule];
        if (p.paymentsByexID[exID] == 0) {
            return false;
        } else {
            bool flag = false;
            for (uint256 i = 1; i <= p.paymentsNum && !flag; i++) {
                if (p.payments[i].paid == false) return false;
                if (
                    keccak256(abi.encodePacked(p.payments[i].exID)) ==
                    keccak256(abi.encodePacked(exID))
                ) flag = true;
            }
            return flag;
        }
    }

    /// Authorization Service method
    function checkPermissions(address user, bytes memory exID)
        public
        view
        returns (bool)
    {
        uint256 tId = tendersByexID[exID];
        if (tId == 0) {
            return false;
        } else {
            Tender storage t = tenders[tId];
            if (user == t.authorized) {
                return true;
            } else {
                return false;
            }
        }
    }
}

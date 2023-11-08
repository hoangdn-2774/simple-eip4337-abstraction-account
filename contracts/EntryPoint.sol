//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

/**
 * A contract to verify the claiming request
 */
contract VerifySignature {
    function getMessageHash(
        address _sender,
        uint256 _id
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_sender, _id));
    }

    /**
     * @dev Get Eth signed message hash
     * @param _messageHash  input hash
     */
    function getEthSignedMessageHash(
        bytes32 _messageHash
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    _messageHash
                )
            );
    }

    function verify(
        address _signer,
        uint256 _id,
        bytes memory signature
    ) public pure returns (bool) {
        bytes32 messageHash = getMessageHash(_signer, _id);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethSignedMessageHash, signature) == _signer;
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(
        bytes memory sig
    ) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }
    }
}

contract EntryPoint is Ownable(msg.sender), VerifySignature {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        address paymaster;
        uint256 maxGasFee;
        bytes signature;
    }

    mapping(bytes32 => bool) isDone;
    mapping(address => uint256) public userBalance;

    function depositFee() external payable {
        userBalance[msg.sender] += msg.value;
    }

    function handleOps(UserOperation[] calldata ops) external {
        for (uint256 ind = 0; ind < ops.length; ind++) {
            uint256 preGas = gasleft();

            // get message hash
            bytes32 messageHash = getMessageHash(
                ops[ind].sender,
                ops[ind].nonce
            );

            require(!isDone[messageHash], "EntryPoint: already done");

            // get target owner
            address targetOwner = IAccount(ops[ind].sender).owner();

            // verify signature
            require(
                verify(targetOwner, ops[ind].nonce, ops[ind].signature),
                "EntryPoint: Invalid signature"
            );

            // mark as done
            isDone[messageHash] = true;

            _call(ops[ind].sender, 0, ops[ind].callData);

            // prepare payment list
            address[] memory addrs = new address[](2);
            addrs[0] = msg.sender;
            addrs[1] = owner();
            uint256[] memory fees = new uint256[](2);
            fees[0] = ops[ind].maxGasFee;
            fees[1] = 1000; // operation fee, send to entrypoint owner

            // call paymaster to pay
            IPayMaster(ops[ind].paymaster).pay(addrs, fees);

            require(
                (preGas - gasleft()) * tx.gasprice <= ops[ind].maxGasFee,
                "EntryPoint: Insufficient fee"
            );
        }
    }

    function handleOp(UserOperation calldata op) external {
        uint256 preGas = gasleft();

        // get message hash
        bytes32 messageHash = getMessageHash(op.sender, op.nonce);

        require(!isDone[messageHash], "EntryPoint: already done");

        // get target owner
        address targetOwner = IAccount(op.sender).owner();

        // verify signature
        require(
            verify(targetOwner, op.nonce, op.signature),
            "EntryPoint: Invalid signature"
        );

        // mark as done
        isDone[messageHash] = true;

        _call(op.sender, 0, op.callData);

        // prepare payment list
        address[] memory addrs = new address[](2);
        addrs[0] = msg.sender;
        addrs[1] = owner();
        uint256[] memory fees = new uint256[](2);
        fees[0] = op.maxGasFee;
        fees[1] = 1000;

        // call paymaster to pay
        IPayMaster(op.paymaster).pay(addrs, fees);

        require(
            (preGas - gasleft()) * tx.gasprice <= op.maxGasFee,
            "EntryPoint: Insufficient fee"
        );
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
}

abstract contract IPayMaster {
    function pay(
        address[] calldata targets,
        uint256[] calldata amounts
    ) external virtual;
}

abstract contract IAccount {
    function owner() external virtual returns (address);
}

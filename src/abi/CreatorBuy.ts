export const CreatorBuy_abi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_factory",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_swapRouter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_wbnb",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "WBNB",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "factory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "receiveTokens",
    "inputs": [
      {
        "name": "config",
        "type": "tuple",
        "internalType": "struct ITokenFactory.DeploymentConfig",
        "components": [
          {
            "name": "tokenConfig",
            "type": "tuple",
            "internalType": "struct ITokenFactory.TokenConfig",
            "components": [
              {
                "name": "name",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "symbol",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "tokenAdmin",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "image",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "metadata",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "context",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "poolConfig",
            "type": "tuple",
            "internalType": "struct ITokenFactory.PoolConfig",
            "components": [
              {
                "name": "pairedToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "fee",
                "type": "uint24",
                "internalType": "uint24"
              },
              {
                "name": "tickIfToken0IsBase",
                "type": "int24",
                "internalType": "int24"
              },
              {
                "name": "tickLower",
                "type": "int24",
                "internalType": "int24"
              },
              {
                "name": "tickUpper",
                "type": "int24",
                "internalType": "int24"
              }
            ]
          },
          {
            "name": "feeConfig",
            "type": "tuple",
            "internalType": "struct ITokenFactory.FeeConfig",
            "components": [
              {
                "name": "recipients",
                "type": "address[]",
                "internalType": "address[]"
              },
              {
                "name": "recipientBps",
                "type": "uint16[]",
                "internalType": "uint16[]"
              }
            ]
          },
          {
            "name": "extensionConfigs",
            "type": "tuple[]",
            "internalType": "struct ITokenFactory.ExtensionConfig[]",
            "components": [
              {
                "name": "extension",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "bps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "msgValue",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "data",
                "type": "bytes",
                "internalType": "bytes"
              }
            ]
          }
        ]
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "extensionSupply",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "extensionIndex",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "swapRouter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sweepBNB",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sweepToken",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "CreatorBought",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bnbAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "tokenAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "InsufficientOutput",
    "inputs": [
      {
        "name": "expected",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "actual",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidMsgValue",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoBNBSent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSupplyAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyFactory",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ValueMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroRecipient",
    "inputs": []
  }
] as const;


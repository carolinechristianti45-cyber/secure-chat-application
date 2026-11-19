const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

let username = "";
let targetUsername = "";
let askedUsername = false;

const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");
});

// Receive public keys of existing users
socket.on("init", (keys) => {
  keys.forEach(([user, key]) => {
    users.set(user, key);
  });

  console.log(`There are currently ${users.size} users in the chat`);

  if (!askedUsername) {
    askedUsername = true;

    rl.question("Enter your username: ", (input) => {
      username = input;

      console.log(`Welcome, ${username} to the chat`);

      socket.emit("registerPublicKey", {
        username,
        publicKey,
      });

      rl.prompt();
    });
  }
});

// Receive public key of new users
socket.on("newUser", (data) => {
  const { username, publicKey } = data;

  users.set(username, publicKey);

  console.log(`${username} joined the chat`);
  rl.prompt();
});

rl.on("line", (message) => {
  if (message.trim()) {
    const match = message.match(/^!secret (\w+)$/);

    if (match) {
      targetUsername = match[1];

      console.log(`Now secretly chatting with ${targetUsername}`);
    } else if (message === "!exit") {
      console.log(`No more secretly chatting with ${targetUsername}`);

      targetUsername = "";
    } else {
      if (targetUsername) {
        const targetPublicKey = users.get(targetUsername);

        if (!targetPublicKey) {
          console.log(`${targetUsername} is not online or has no public key.`);
          rl.prompt();
          return;
        }

        // Encrypt message using target's public key
        const encryptedMessage = crypto.publicEncrypt(
          {
            key: targetPublicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          Buffer.from(message)
        ).toString("base64");

        socket.emit("message", {
          username,
          targetUsername,
          message: encryptedMessage,
          encrypted: true,
        });

      } else {
        // Send normal message
        socket.emit("message", {
          username,
          message,
          encrypted: false,
        });
      }
    }
  }

  rl.prompt();
});

socket.on("message", (data) => {
  const {
    username: senderUsername,
    targetUsername: receiverUsername,
    message: receivedMessage,
    encrypted,
  } = data;

  if (encrypted) {
    if (receiverUsername === username) {
      // Decrypt message using our private key
      const decryptedMessage = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(receivedMessage, "base64")
      ).toString();

      console.log(`${senderUsername} (Secret): ${decryptedMessage}`);
    } else {
      // Display ciphertext for other users
      console.log(`${senderUsername} (Encrypted): ${receivedMessage}`);
    }
  } else {
    if (senderUsername !== username) {
      console.log(`${senderUsername}: ${receivedMessage}`);
    }
  }

  rl.prompt();
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
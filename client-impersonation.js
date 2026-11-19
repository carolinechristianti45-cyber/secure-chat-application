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
let registeredUsername = "";

const users = new Map();
socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;

    console.log(`Welcome, ${username} to the chat`);

    // Register username and public key
    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });

    rl.prompt();
  });
});

// Receive public keys of users who are already connected
socket.on("init", (existingUsers) => {
  existingUsers.forEach(([name, key]) => {
    users.set(name, key);
  });
});

// Receive public key of a newly connected user
socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);

  console.log(`${username} joined the chat`);
  rl.prompt();
});

// Send message
rl.on("line", (message) => {
  if (!message.trim()) {
    rl.prompt();
    return;
  }

  // Impersonation command
  const match = message.match(/^!impersonate (.+)$/);

  if (match) {
    username = match[1];
    console.log(`You are now impersonating ${username}`);
    rl.prompt();
    return;
  }

  // Exit impersonation
  if (message === "!exit") {
    username = registeredUsername;
    console.log(`You are back as ${username}`);
    rl.prompt();
    return;
  }

  // Create digital signature
  const payload = `${username}:${message}`;

  const signature = crypto.sign(
    "sha256",
    Buffer.from(payload),
    privateKey
  ).toString("base64");

  // Send message to server
  socket.emit("message", {
    username,
    message,
    signature,
  });

  rl.prompt();
});

// Receive and verify message
socket.on("message", (data) => {
  const {
    username: senderUsername,
    message: senderMessage,
    signature,
  } = data;

  const senderPublicKey = users.get(senderUsername);

  if (!senderPublicKey) {
    console.log("WARNING: this user is fake");
    rl.prompt();
    return;
  }

  const payload = `${senderUsername}:${senderMessage}`;

  const isValid = crypto.verify(
    "sha256",
    Buffer.from(payload),
    senderPublicKey,
    Buffer.from(signature, "base64")
  );

  if (!isValid) {
    console.log("WARNING: this user is fake");
  } else if (senderUsername !== username) {
    console.log(`${senderUsername}: ${senderMessage}`);
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
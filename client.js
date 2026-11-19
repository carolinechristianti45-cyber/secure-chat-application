const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");
function generateHash(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let username = "";

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);
  });
});

rl.on("line", (message) => {
  if (message.trim()) {
    const hash = generateHash(message);

    socket.emit("message", { username, message, hash });
  }
});

socket.on("message", (data) => {
  const {
    username: senderUsername,
    message: senderMessage,
    hash: receivedHash,
  } = data;

  const calculatedHash = generateHash(senderMessage);

  if (calculatedHash !== receivedHash) {
    console.log("WARNING: The message may have been changed during transmission");
  } else {
    if (senderUsername !== username) {
      console.log(`${senderUsername}: ${senderMessage}`);
    }
  }
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
import net from "node:net";

const ports = [5173, 8787];

function verifyPort(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the existing Raktakosh terminal, then run npm run dev again.`);
      } else {
        console.error(`Unable to check port ${port}: ${error.message}`);
      }
      resolve(false);
    });
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

const available = await Promise.all(ports.map(verifyPort));

if (available.some((portIsAvailable) => !portIsAvailable)) {
  process.exit(1);
}

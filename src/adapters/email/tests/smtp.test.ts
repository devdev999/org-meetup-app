import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { expect, test } from "vitest";
import { SmtpEmail } from "../smtp";

test("the SMTP adapter delivers a plain email with the configured sender and refuses a rejected recipient", async () => {
  const messages: string[] = [];
  const commands: string[] = [];
  let refuseRecipient = false;
  const server = createServer((socket) => {
    socket.write("220 localhost SMTP\r\n");
    let data: string[] | undefined;
    createInterface({ input: socket, crlfDelay: Infinity }).on("line", (line) => {
      if (data) {
        if (line === ".") {
          messages.push(data.join("\n"));
          data = undefined;
          socket.write("250 Accepted\r\n");
        } else data.push(line);
      } else {
        commands.push(line);
        if (line === "DATA") { data = []; socket.write("354 Send message\r\n"); }
        else if (line === "QUIT") socket.end("221 Bye\r\n");
        else if (refuseRecipient && line.startsWith("RCPT TO:")) socket.write("550 No such recipient\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  try {
    const email = new SmtpEmail({ url: `smtp://127.0.0.1:${address.port}` });
    const message = { from: "meetups@example.test", id: "notice-1", to: "ana@example.test", subject: "Meetup notice", text: "Bo joined your Meetup." };
    await email.sendMessage(message);
    expect(commands).toContain("MAIL FROM:<meetups@example.test>");
    expect(commands).toContain("RCPT TO:<ana@example.test>");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Subject: Meetup notice");
    expect(messages[0]).toContain("Content-Type: text/plain");
    expect(messages[0]).toContain("Bo joined your Meetup.");
    await email.sendMessage({ ...message, id: "notice-2", from: "changed@example.test" });
    expect(commands).toContain("MAIL FROM:<changed@example.test>");
    refuseRecipient = true;
    await expect(email.sendMessage(message)).rejects.toThrow();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

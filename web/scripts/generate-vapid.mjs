import webpush from "web-push";

if (process.env.VAPID_PRIVATE_KEY || process.env.VAPID_PUBLIC_KEY) {
  console.error("A VAPID key is already configured. Keep this key instead of generating a replacement.");
  process.exitCode = 1;
} else {
  const keys = webpush.generateVAPIDKeys();
  console.log("Copy these values to your local .env file and private Render environment settings. Never commit the private key.\n");
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log("VAPID_SUBJECT=mailto:admin@example.com\n");
  console.log("Replace admin@example.com with an email address your players can use if a reminder has a problem.");
}

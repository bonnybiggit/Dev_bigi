import mongoose from "mongoose";
import dns from "node:dns";

export function connectDB(uri, dnsServers = []) {
  // Configure the process resolver before the driver starts SRV/TXT lookups.
  // An omitted/blank setting preserves the operating system's DNS configuration.
  if (dnsServers.length) dns.setServers(dnsServers);
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

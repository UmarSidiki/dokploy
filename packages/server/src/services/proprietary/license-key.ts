import { db } from "@dokploy/server/db";
import { user } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { getOrganizationOwnerId } from "./sso";

export const hasValidLicense = async (_organizationId?: string) => {
	return true;
};

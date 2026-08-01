# Dokploy Enterprise License & SSO Fix Guide

This guide details how to Fix the enterprise license checks in Dokploy to unlock all Enterprise and SSO features, as well as how to build and update your self-hosted Dokploy instance.

---

## Code Modifications Overview

To fully enable enterprise features (SSO, custom roles, audit logs, whitelabeling, etc.) without contacting an external license server, modifications are made across 5 main files:

### 1. `packages/server/src/services/proprietary/license-key.ts`

**Location:** `packages/server/src/services/proprietary/license-key.ts`

**Action:** Replace `hasValidLicense` to return `true` unconditionally.

```typescript
export const hasValidLicense = async (_organizationId?: string) => {
	return true;
};
```

---

### 2. `apps/dokploy/server/utils/enterprise.ts`

**Location:** `apps/dokploy/server/utils/enterprise.ts`

**Action:** Override `validateLicenseKey` to bypass remote API calls and return `true`.

```typescript
export const validateLicenseKey = async (_licenseKey: string) => {
	return true;
};
```

---

### 3. `packages/server/src/utils/crons/enterprise.ts`

**Location:** `packages/server/src/utils/crons/enterprise.ts`

**Action:** Override `validateLicenseKey` in background cron jobs to prevent remote verification failures.

```typescript
export const validateLicenseKey = async (_licenseKey: string) => {
	return true;
};
```

---

### 4. `apps/dokploy/server/api/routers/proprietary/license-key.ts`

**Location:** `apps/dokploy/server/api/routers/proprietary/license-key.ts`

**Action:** Update the tRPC router to automatically report valid enterprise settings and bypass role/license restrictions.

```typescript
import { db } from "@dokploy/server/db";
import { user } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";

export const licenseKeyRouter = createTRPCRouter({
	activate: adminProcedure
		.input(z.object({ licenseKey: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			try {
				const currentUserId = ctx.user.id;
				await db
					.update(user)
					.set({
						licenseKey: input.licenseKey,
						isValidEnterpriseLicense: true,
						enableEnterpriseFeatures: true,
					})
					.where(eq(user.id, currentUserId));
				return { success: true };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to activate license key",
					cause: error as Error,
				});
			}
		}),
	validate: adminProcedure.mutation(async ({ ctx }) => {
		try {
			const currentUserId = ctx.user.id;
			await db
				.update(user)
				.set({
					isValidEnterpriseLicense: true,
					enableEnterpriseFeatures: true,
				})
				.where(eq(user.id, currentUserId));
			return true;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error
						? error.message
						: "Failed to validate license key",
			});
		}
	}),
	deactivate: adminProcedure.mutation(async ({ ctx }) => {
		try {
			const currentUserId = ctx.user.id;
			await db
				.update(user)
				.set({
					licenseKey: "DOKPLOY-ENTERPRISE-KEY",
					isValidEnterpriseLicense: true,
					enableEnterpriseFeatures: true,
				})
				.where(eq(user.id, currentUserId));
			return { success: true };
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error
						? error.message
						: "Failed to deactivate license key",
			});
		}
	}),
	getEnterpriseSettings: adminProcedure.query(async ({ ctx }) => {
		const currentUserId = ctx.user.id;
		const currentUser = await db.query.user.findFirst({
			where: eq(user.id, currentUserId),
		});

		if (!currentUser) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		return {
			enableEnterpriseFeatures: true,
			licenseKey: currentUser.licenseKey || "DOKPLOY-ENTERPRISE-KEY",
		};
	}),
	haveValidLicenseKey: protectedProcedure.query(async () => {
		return true;
	}),
	updateEnterpriseSettings: adminProcedure
		.input(
			z.object({
				enableEnterpriseFeatures: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx }) => {
			try {
				const currentUserId = ctx.user.id;
				await db
					.update(user)
					.set({
						enableEnterpriseFeatures: true,
						isValidEnterpriseLicense: true,
					})
					.where(eq(user.id, currentUserId));

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to update enterprise settings",
				});
			}
		}),
});
```

---

### 5. `packages/server/src/lib/auth.ts`

**Location:** `packages/server/src/lib/auth.ts`

**Action:** Ensure all user session objects flag `enableEnterpriseFeatures` and `isValidEnterpriseLicense` as `true`.

In `validateRequest` (around line 612):

```typescript
session.user.role = member?.role || "member";
session.user.enableEnterpriseFeatures = true;
session.user.isValidEnterpriseLicense = true;
session.session.activeOrganizationId = member?.organization.id || "";
```

---

## Manual Update & Build Instructions

To apply these changes on your VPS, run the following commands:

```bash
cd ~
git clone https://github.com/UmarSidiki/dokploy.git dokploy-custom
cd dokploy-custom

# Build the custom Docker image
sudo docker build -t dokploy-custom:latest -f Dockerfile .

# Update the running Dokploy Swarm service
sudo docker service update --image dokploy-custom:latest dokploy

# Reboot VPS to apply all updates cleanly
sudo reboot
```

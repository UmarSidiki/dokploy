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

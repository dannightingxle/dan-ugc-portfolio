import { BRAND_ID } from "../../../../../hub/_lib/studio/data";
import { makeBrandPlan } from "../../../../../hub/_lib/studio/brand";
import { BrandPlanBody, studioAction } from "../../../../../hub/_lib/studio/request";

/* This week's personal brand plan and shoot sheet. */
export const maxDuration = 300;

export async function POST(request: Request) {
  return studioAction(request, BRAND_ID, BrandPlanBody, ({ user, body }) => makeBrandPlan(user, body), { feature: "brand" });
}

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";

export const sendContactNotification = internalAction({
  args: {
    leadId: v.id("leads"),
    name: v.string(),
    email: v.string(),
    website: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping email notification");
      return;
    }

    const websiteLine = args.website
      ? `<p><strong>Website:</strong> <a href="${args.website}">${args.website}</a></p>`
      : "";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        reply_to: args.email,
        subject: `New enquiry from ${args.name}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${args.name}</p>
          <p><strong>Email:</strong> ${args.email}</p>
          ${websiteLine}
          <hr />
          <p><strong>Message:</strong></p>
          <p>${args.message.replace(/\n/g, "<br />")}</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
    }
  },
});

/** Email the visitor their Signal Score results with verification link and code. */
export const sendSignalScoreToVisitor = action({
  args: {
    firstName: v.string(),
    email: v.string(),
    url: v.string(),
    overallScore: v.number(),
    gruntTestPass: v.boolean(),
    reportId: v.string(),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping visitor email");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const magicLink = `${siteUrl}/report/${args.reportId}?token=${args.verifyToken}`;
    const gruntResult = args.gruntTestPass
      ? "Your site <strong>passed</strong> the Grunt Test."
      : "Your site <strong>did not pass</strong> the Grunt Test — most visitors can't tell what you do within 5 seconds.";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
        to: args.email,
        subject: `${args.firstName}, your Signal Score is ${args.overallScore}/100`,
        html: `
          <h2>Your Signal Score: ${args.overallScore}/100</h2>
          <p>Hi ${args.firstName},</p>
          <p>We've just analysed <strong>${args.url}</strong> using The Signal Method — our five-element framework for turning your website into a lead-generating machine.</p>
          <p>${gruntResult}</p>
          <p>Your full element-by-element breakdown is ready:</p>
          <p><a href="${magicLink}" style="display:inline-block;padding:14px 28px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:15px;">See Your Full Breakdown</a></p>
          <p style="color:#7b7b96;font-size:13px;margin-top:16px;">If the button doesn't work, enter this code on the report page:</p>
          <p style="font-size:24px;font-weight:800;letter-spacing:4px;color:#1a1a2e;text-align:center;padding:12px;background:#f5f4f0;border-radius:12px;">${args.verifyCode}</p>
          <hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
          <p style="color:#7b7b96;font-size:13px;">This is your Signal Score — how clearly your website communicates to your ideal customer. It's the first element of The Signal Method, and it's the one that matters most.</p>
          <p style="color:#7b7b96;font-size:13px;">Questions? Just reply to this email — it comes straight to me.</p>
          <p style="color:#7b7b96;font-size:13px;">— Daniel Whittaker, Dreamfree</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (visitor email):", error);
    }
  },
});

/** Notify Daniel of a new Signal Score submission. */
export const sendSignalScoreToAdmin = action({
  args: {
    firstName: v.string(),
    email: v.string(),
    url: v.string(),
    customerDescription: v.string(),
    overallScore: v.number(),
    elementScores: v.object({
      character: v.number(),
      problem: v.number(),
      guide: v.number(),
      plan: v.number(),
      cta: v.number(),
      stakes: v.number(),
      transformation: v.number(),
    }),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping admin email");
      return;
    }

    const scores = args.elementScores;
    const scoreRows = [
      `Character: ${scores.character}/10`,
      `Problem: ${scores.problem}/10`,
      `Guide: ${scores.guide}/10`,
      `Plan: ${scores.plan}/10`,
      `CTA: ${scores.cta}/10`,
      `Stakes: ${scores.stakes}/10`,
      `Transformation: ${scores.transformation}/10`,
    ].join("<br />");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        reply_to: args.email,
        subject: `New Signal Score: ${args.url} — ${args.overallScore}/100`,
        html: `
          <h2>New Signal Score Lead</h2>
          <p><strong>Name:</strong> ${args.firstName}</p>
          <p><strong>Email:</strong> ${args.email}</p>
          <p><strong>Website:</strong> <a href="${args.url}">${args.url}</a></p>
          <p><strong>Ideal Customer:</strong> ${args.customerDescription}</p>
          <hr />
          <p><strong>Overall Score:</strong> ${args.overallScore}/100</p>
          <p><strong>Element Scores:</strong><br />${scoreRows}</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (admin email):", error);
    }
  },
});

/** Notify Daniel when a lead requests a report review callback. */
export const sendCallbackNotification = action({
  args: {
    firstName: v.string(),
    email: v.string(),
    phone: v.string(),
    url: v.string(),
    overallScore: v.number(),
    reportId: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping callback notification");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const reportLink = `${siteUrl}/report/${args.reportId}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        reply_to: args.email,
        subject: `Callback requested: ${args.firstName} (Score: ${args.overallScore}/100)`,
        html: `
          <h2>Report Review Call Requested</h2>
          <p><strong>Name:</strong> ${args.firstName}</p>
          <p><strong>Email:</strong> ${args.email}</p>
          <p><strong>Phone:</strong> ${args.phone}</p>
          <p><strong>Website:</strong> <a href="${args.url}">${args.url}</a></p>
          <p><strong>Signal Score:</strong> ${args.overallScore}/100</p>
          <hr />
          <p><a href="${reportLink}">View their report</a></p>
          <p style="color:#7b7b96;font-size:13px;margin-top:16px;">This lead has reviewed their Signal Score report and wants to talk. Call them.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (callback notification):", error);
    }
  },
});

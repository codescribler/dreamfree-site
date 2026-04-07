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
    const magicLink = `${siteUrl}/api/report/${args.reportId}/verify?token=${args.verifyToken}`;
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

/** Notify Daniel when someone generates a content plan. */
export const sendContentPlanNotification = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    businessDescription: v.string(),
    goal: v.string(),
    channelsTried: v.array(v.string()),
    frustration: v.string(),
    timePerWeek: v.string(),
    website: v.optional(v.string()),
    planId: v.string(),
    ideaTitles: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping content plan notification");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const planLink = `${siteUrl}/content-plan/${args.planId}`;
    const websiteLine = args.website
      ? `<tr><td style="padding:6px 12px 6px 0;color:#888;">Website</td><td style="padding:6px 0;"><a href="${args.website}">${args.website}</a></td></tr>`
      : "";
    const channels = args.channelsTried.length > 0
      ? args.channelsTried.join(", ")
      : "Nothing yet";
    const ideasHtml = args.ideaTitles
      .map((t, i) => `<li style="margin-bottom:4px;">${i + 1}. ${t}</li>`)
      .join("");

    const hotLead = args.timePerWeek.toLowerCase().includes("outsource");

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
        subject: `${hotLead ? "🔥 HOT LEAD — " : ""}New Content Plan: ${args.name} (${args.goal})`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;">
            <h2 style="margin:0 0 16px;">New Content Plan Generated</h2>
            ${hotLead ? '<div style="background:#fff3cd;border-left:3px solid #e6a817;padding:10px 14px;margin-bottom:16px;font-size:14px;font-weight:600;">This lead said they\'d rather outsource content — follow up quickly.</div>' : ""}
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Name</td><td style="padding:6px 0;font-weight:600;">${args.name}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Email</td><td style="padding:6px 0;">${args.email}</td></tr>
              ${websiteLine}
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Goal</td><td style="padding:6px 0;">${args.goal}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Time budget</td><td style="padding:6px 0;">${args.timePerWeek}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Channels tried</td><td style="padding:6px 0;">${channels}</td></tr>
            </table>
            <div style="margin:16px 0;padding:14px;background:#f5f4f0;border-radius:10px;">
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">About their business</p>
              <p style="margin:0;font-size:14px;">${args.businessDescription}</p>
            </div>
            <div style="margin:16px 0;padding:14px;background:#fff0f0;border-radius:10px;">
              <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Their biggest frustration</p>
              <p style="margin:0;font-size:14px;">${args.frustration}</p>
            </div>
            <div style="margin:16px 0;">
              <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Ideas generated</p>
              <ol style="margin:0;padding-left:0;list-style:none;font-size:14px;">${ideasHtml}</ol>
            </div>
            <p><a href="${planLink}" style="display:inline-block;padding:12px 24px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:14px;">View Their Plan</a></p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (content plan notification):", error);
    }
  },
});

/** Email the visitor a link to their content plan. */
export const sendContentPlanToVisitor = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    planId: v.string(),
    ideaTitles: v.array(v.string()),
    summary: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping visitor content plan email");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const planLink = `${siteUrl}/content-plan/${args.planId}`;
    const firstName = args.name.split(" ")[0];
    const ideasHtml = args.ideaTitles
      .map((t, i) => `<li style="margin-bottom:6px;font-size:14px;color:#1a1a2e;">${i + 1}. ${t}</li>`)
      .join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
        to: args.email,
        subject: `${firstName}, your 90-day content plan is ready`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;">
            <h2 style="margin:0 0 12px;color:#1a1a2e;">Your Content Plan is Ready</h2>
            <p style="font-size:15px;color:#4a4a68;line-height:1.7;">Hi ${firstName},</p>
            <p style="font-size:15px;color:#4a4a68;line-height:1.7;">${args.summary}</p>
            <p style="font-size:15px;color:#4a4a68;line-height:1.7;">Here&rsquo;s a preview of your 6 content ideas:</p>
            <ol style="margin:16px 0;padding-left:20px;">${ideasHtml}</ol>
            <p style="margin:24px 0;">
              <a href="${planLink}" style="display:inline-block;padding:14px 28px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:15px;">View Your Full Plan</a>
            </p>
            <p style="font-size:15px;color:#4a4a68;line-height:1.7;">Each idea includes a detailed brief, target keyword, and time estimate &mdash; everything you need to get started or hand to a writer.</p>
            <p style="font-size:15px;color:#4a4a68;line-height:1.7;">Want help executing the plan? Just reply to this email &mdash; it comes straight to me.</p>
            <hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
            <p style="color:#7b7b96;font-size:13px;">&mdash; Daniel Whittaker, <a href="https://dreamfree.co.uk" style="color:#0d7377;">Dreamfree</a></p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (visitor content plan email):", error);
    }
  },
});

/** Email a shared Signal Score report link to a recipient. */
export const sendShareEmail = action({
  args: {
    recipientEmail: v.string(),
    sharerName: v.string(),
    sharerMessage: v.optional(v.string()),
    url: v.string(),
    overallScore: v.number(),
    reportId: v.string(),
    verifyToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set — skipping share email");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";
    const magicLink = `${siteUrl}/api/report/${args.reportId}/verify?token=${args.verifyToken}`;
    const personalMessage = args.sharerMessage
      ? `<p style="margin:16px 0;padding:16px;background:#f5f4f0;border-radius:12px;font-style:italic;color:#444;">&ldquo;${args.sharerMessage}&rdquo;</p>`
      : "";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
        to: args.recipientEmail,
        subject: `${args.sharerName} shared a Signal Score report with you (${args.overallScore}/100)`,
        html: `
          <h2>Someone shared a Signal Score report with you</h2>
          <p><strong>${args.sharerName}</strong> thought you&rsquo;d find this useful &mdash; a website messaging audit for <strong>${args.url}</strong>, scored using The Signal Method.</p>
          ${personalMessage}
          <p>The site scored <strong>${args.overallScore} out of 100</strong> across seven key messaging elements.</p>
          <p><a href="${magicLink}" style="display:inline-block;padding:14px 28px;background:#0d7377;color:#fff;text-decoration:none;border-radius:60px;font-weight:600;font-size:15px;">View the Full Report</a></p>
          <hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
          <p style="color:#7b7b96;font-size:13px;">The Signal Method measures how clearly a website communicates to its ideal customer. It&rsquo;s built by <a href="https://dreamfree.co.uk">Dreamfree</a> &mdash; a web agency that builds websites people actually respond to.</p>
          <p style="color:#7b7b96;font-size:13px;">Want your own website scored? <a href="https://dreamfree.co.uk">Get a free Signal Score</a>.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error (share email):", error);
    }
  },
});

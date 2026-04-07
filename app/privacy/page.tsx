import { buildMetadata } from "@/lib/metadata";
import { SITE } from "@/lib/constants";

export const metadata = buildMetadata({
  title: "Privacy Policy",
  description: "How Dreamfree collects, uses, and protects your personal data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[760px] px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,10vw,8rem)]">
      <h1 className="mb-3 text-[clamp(2rem,5vw,3rem)] font-extrabold tracking-tight text-charcoal">
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm text-muted">Last updated: 5 April 2026</p>

      <div className="space-y-8 text-[0.95rem] leading-[1.8] text-slate [&_h2]:mb-3 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-charcoal [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
        <section>
          <h2>Who we are</h2>
          <p>
            Dreamfree is a web development and digital agency based in{" "}
            {SITE.location}, UK, operated by {SITE.owner}. When we say
            &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo; in this
            policy, we mean Dreamfree.
          </p>
          <p className="mt-2">
            Email:{" "}
            <a href={`mailto:${SITE.email}`} className="text-teal underline">
              {SITE.email}
            </a>
            <br />
            Phone: {SITE.phone}
          </p>
        </section>

        <section>
          <h2>What data we collect</h2>
          <p>We collect the following personal data when you use our website:</p>
          <ul>
            <li>
              <strong>Signal Score submissions:</strong> Your name, email
              address, phone number (optional), website URL, and a description
              of your ideal customer. This is provided by you when you request a
              free Signal Score.
            </li>
            <li>
              <strong>Contact form submissions:</strong> Your name, email
              address, phone number (optional), website URL, and message.
            </li>
            <li>
              <strong>Report sharing:</strong> When you share a report, we
              collect the email addresses of the people you choose to share
              with.
            </li>
            <li>
              <strong>Analytics data:</strong> We use Microsoft Clarity and
              Vercel Analytics to understand how visitors use our site. This
              includes pages visited, time on site, device type, and general
              location. This data is anonymised and cannot identify you
              personally.
            </li>
            <li>
              <strong>Cookies:</strong> We use essential cookies to remember
              your preferences (such as dismissing the cookie notice) and to
              verify access to your Signal Score report. We do not use
              advertising or tracking cookies.
            </li>
          </ul>
        </section>

        <section>
          <h2>How we use your data</h2>
          <ul>
            <li>To generate and deliver your Signal Score report</li>
            <li>To send you your report via email, including a verification link</li>
            <li>To respond to enquiries submitted through our contact form</li>
            <li>To notify you of relevant services we offer (you can opt out at any time by replying to any email)</li>
            <li>To improve our website and services based on anonymised analytics</li>
          </ul>
        </section>

        <section>
          <h2>Legal basis for processing</h2>
          <p>
            We process your data on the basis of <strong>legitimate interest</strong>{" "}
            (delivering the service you requested and following up with relevant
            information) and <strong>consent</strong> (you actively submit your
            details through our forms). You can withdraw consent at any time by
            contacting us.
          </p>
        </section>

        <section>
          <h2>Who we share your data with</h2>
          <p>We use the following third-party services to operate our website:</p>
          <ul>
            <li>
              <strong>Convex</strong> &mdash; database hosting (stores your
              report data and lead information)
            </li>
            <li>
              <strong>Resend</strong> &mdash; email delivery (sends your report
              emails and notifications)
            </li>
            <li>
              <strong>Custom authentication</strong> &mdash; email and password
              login for admin access (session stored in a secure cookie)
            </li>
            <li>
              <strong>Vercel</strong> &mdash; website hosting and analytics
            </li>
            <li>
              <strong>Microsoft Clarity</strong> &mdash; anonymised session
              analytics
            </li>
            <li>
              <strong>OpenRouter</strong> &mdash; AI analysis (your website
              content is sent for scoring; no personal data is included in the
              AI request)
            </li>
          </ul>
          <p className="mt-2">
            We do not sell your data to anyone. We do not share your data with
            any parties other than those listed above.
          </p>
        </section>

        <section>
          <h2>How long we keep your data</h2>
          <p>
            We retain your Signal Score report and contact details for as long
            as they are useful for providing our services. If you would like
            your data deleted, contact us at{" "}
            <a href={`mailto:${SITE.email}`} className="text-teal underline">
              {SITE.email}
            </a>{" "}
            and we will remove it within 30 days.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>Under UK GDPR, you have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to processing of your data</li>
            <li>Request a copy of your data in a portable format</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, email{" "}
            <a href={`mailto:${SITE.email}`} className="text-teal underline">
              {SITE.email}
            </a>
            . We will respond within 30 days.
          </p>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>We use the following cookies:</p>
          <ul>
            <li>
              <strong>df_cookies_ok</strong> &mdash; remembers that you
              dismissed the cookie notice (1 year)
            </li>
            <li>
              <strong>df_report_*</strong> &mdash; verifies your access to a
              specific Signal Score report (1 year)
            </li>
            <li>
              <strong>df_session</strong> &mdash; manages your admin login
              session (7 days)
            </li>
          </ul>
          <p className="mt-2">
            We do not use advertising cookies or cross-site tracking.
          </p>
        </section>

        <section>
          <h2>Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Any changes will be
            posted on this page with an updated date. For significant changes,
            we will make reasonable efforts to notify you.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            If you have any questions about this privacy policy or how we
            handle your data, contact us at{" "}
            <a href={`mailto:${SITE.email}`} className="text-teal underline">
              {SITE.email}
            </a>{" "}
            or call {SITE.phone}.
          </p>
        </section>
      </div>
    </div>
  );
}

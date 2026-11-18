import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Markdown } from "@/lib/markdown";

const UPDATED = "18 November 2026";

const PRIVACY = `This policy explains how ProfJero DataLab ("DataLab", "we"), a product of ProfJero Digital Studio, handles personal data. It is provided in good faith to describe how the platform works and has not yet been reviewed by legal counsel; it does not claim certification under any specific law. We aim to follow the principles of Ghana's Data Protection Act, 2012 (Act 843) and comparable laws.

## Roles
- **Account holders.** We are responsible for the data you give us to run your account (name, email, workspace details, billing records).
- **Form responses.** Workspaces that publish forms decide what they collect and why. For response data, the workspace is the controller and DataLab processes it on their behalf.

## What we collect
- Account data: name, email, password (stored as a secure hash by our authentication provider), profile photo if you upload one, onboarding answers such as intended use.
- Workspace content: forms, reports and settings you create.
- Responses: answers submitted by respondents, submission time, approximate completion time, device type (mobile/tablet/desktop), referring website and country derived from the network. When "one response per device" is enabled, a salted one-way hash of network and browser details is stored to detect duplicates — not your raw IP address.
- Usage and security logs: audit events (for example "form published"), AI usage counts and error reports.

## How we use data
To provide and secure the service, enforce plan limits, prevent spam and abuse, provide support, and comply with legal obligations. We do not sell personal data.

## AI processing
AI features are optional. When used, DataLab sends aggregated statistics and a limited sample of written answers to the configured AI provider. Email addresses, phone numbers and links are redacted, and contact-type questions are excluded. Workspace admins and form owners can switch AI analysis off.

## Service providers
We use Supabase (database and authentication), Cloudflare (hosting and networking), Cloudinary (image and file storage), and — only when enabled — an AI provider, an email provider and a payment provider (such as Paystack). They process data only to provide their services to us.

## Storage and security
Data is protected with encryption in transit, row-level security that isolates each workspace, role-based permissions and audit logging. Data may be processed outside Ghana by our service providers.

## Retention
Account data is kept while your account is active. Workspaces can set a response retention policy and delete responses or forms at any time. Deleted data is removed from active systems promptly; backups expire on our providers' schedules.

## Your rights
You can access and export your data (Account → Export my data), correct your profile, delete responses and forms you control, and request deletion of your account (Account → Request deletion). Respondents should contact the organisation that published the form; we will assist them.

## Cookies and local storage
We use only essential browser storage to keep you signed in and remember your selected workspace. We do not use advertising or tracking cookies.

## Changes
We will post updates here and notify account holders of material changes.

_Last updated: ${UPDATED}._`;

const TERMS = `These terms govern your use of ProfJero DataLab, a product of ProfJero Digital Studio. They are provided in good faith and have not yet been reviewed by legal counsel.

## Your account
Provide accurate information and keep your password secure. You are responsible for activity in your account and workspaces.

## Acceptable use
Do not use DataLab to collect passwords or payment card details through forms, to run phishing, spam or fraud, to harass anyone, to collect special categories of personal data without a lawful basis, or to break any law. We may close forms, suspend accounts or remove content that violates these terms. Anyone can report a form using the link on the form.

## Your content and responses
You keep ownership of your forms, reports and the responses you collect. You grant us the permissions needed to host and process them to provide the service. You are responsible for having a lawful basis for the data you collect and for telling respondents how you will use it.

## AI features
AI output may be incomplete or wrong. DataLab grounds AI answers in calculated statistics and flags unverified figures, but you are responsible for reviewing AI-assisted content before relying on or sharing it.

## Plans and payment
Plan features and limits are shown in the app. Paid plans renew for the period purchased. Prices may change with notice. Where online payment is not enabled, plans may be arranged directly.

## Availability
We work to keep DataLab available and secure but provide it "as is" without guarantees of uninterrupted service. To the extent permitted by law, our liability is limited to the amount you paid in the twelve months before the claim.

## Termination
You can stop using DataLab and request account deletion at any time. We may suspend access for serious or repeated violations.

## Governing law
These terms are governed by the laws of the Republic of Ghana.

_Last updated: ${UPDATED}._`;

export default function Legal({ doc }: { doc: "privacy" | "terms" }) {
  return (
    <MarketingLayout>
      <article className="container max-w-3xl py-16">
        <h1 className="text-4xl font-semibold">{doc === "privacy" ? "Privacy policy" : "Terms of service"}</h1>
        <div className="mt-8 text-ink-muted"><Markdown text={doc === "privacy" ? PRIVACY : TERMS} /></div>
      </article>
    </MarketingLayout>
  );
}

# Legitimate-interest assessment — sales outreach video (template)

The plugin ships this template; it does not fill it in. In `sales` mode the user is the GDPR controller for the
prospect's data, and the assessment is the controller's own record. It is a questionnaire in the usual
three-part shape (purpose, necessity, balancing) with the constraints the plugin already enforces written next to the
questions. **Not legal advice**: have it reviewed where the outreach is sent, and keep the completed copy with the
campaign, not inside the video project.

Plugin constraints the answers can rely on:
- The prospect record holds only **name, company, role, public site** (`--prospect`); nothing else is read or stored,
  and LinkedIn is never scraped.
- The outreach letter the plugin drafts (`share-copy.txt` `[email]`) carries a GDPR **Art. 14** information notice and
  the **Art. 21(2)** right to object with a one-step opt-out; `share-copy.mjs lint` fails a letter without either.
- The prospect's data is kept **30 days** after the run, then purged (`scripts/prospect-retention.mjs`).
- Nothing is sent by the plugin: delivery hooks (Gmail draft, Drive, Notion) are v1 and opt-in, and a Gmail hook only
  drafts.

## 1. Purpose test — is there a legitimate interest?

| Question | Answer (controller) |
| --- | --- |
| What is the purpose of the processing (e.g. introducing a product to a named business contact)? | |
| Is it direct marketing? Recital 47 GDPR notes that processing for direct marketing *may* be regarded as a legitimate interest. | |
| Who benefits (you, the prospect's company, others), and how? | |
| Would the processing be unlawful or unethical in any other way (sector rules, e-marketing / ePrivacy rules in the recipient's country)? | |
| What happens if you do not process the data? | |

## 2. Necessity test — is the processing necessary for that purpose?

| Question | Answer (controller) |
| --- | --- |
| Does a personalised video actually help the purpose, compared with a generic one? | |
| Is the data limited to what is needed (Art. 5(1)(c) data minimisation)? The plugin allows name, company, role and public site only. | |
| Could the same result be reached with less data (e.g. company only, no person)? | |
| Where does each field come from? Record the public source (company website, press page) for each. | |

## 3. Balancing test — do the prospect's interests override yours?

| Question | Answer (controller) |
| --- | --- |
| Is there an existing relationship with the prospect or their company? | |
| Would a person in this role reasonably expect to be contacted this way, from this source? | |
| Is any of the data sensitive, or about a child or a vulnerable person? (It must not be.) | |
| What is the likely impact on the person (time, intrusion, reputational)? | |
| How are they told? The Art. 14 notice goes in the first communication at the latest (Art. 14(3)(b)); confirm the letter carries it. | |
| How can they object? Art. 21(2)–(3): an objection to direct marketing ends that processing; record how a "stop" reply is honoured and propagated to your other lists. | |
| How long is the data kept (Art. 5(1)(e) storage limitation)? The plugin purges it after 30 days; say where else you keep it (CRM, mailbox) and for how long. | |
| Safeguards beyond the above (access limited to …, no sharing with …). | |

## 4. Outcome

| Item | Record |
| --- | --- |
| Conclusion: legitimate interest applies / does not apply | |
| Assessed by, role, date | |
| Review date (at the latest when the purpose, the data or the audience changes) | |

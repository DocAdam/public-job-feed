# Documentation job search playbook

**Derived guide — 27 September 2026.** This guide uses saved Public Job Feed evidence. Example roles are not verified as open today. Finding numbers refer to [the analysis report](ats-behavior-analysis.md).

## Check whether the posting is new to you

Save the employer, full URL, board or tenant, posting ID, first date you saw it, stated posting date, and last successful check. Keep these dates separate.

An existing posting can receive a later date. Infisical's Founding Technical Writer kept its Ashby ID while its saved date moved from January to June. The role was already in the feed before the later date. A later date is a reason to inspect changes; it is not proof of a new opening. Conversely, Greenhouse and Lever cohort roles changed titles without changing dates. [Evidence: F02–F04](ats-behavior-analysis.md#freshnessdate-behavior).

Treat “Posted 30+ Days Ago” as a lower bound tied to the fetch date. A missing date is unknown. First seen in a feed can mean that the feed added the source or changed its filter.

## Use IDs to compare postings

Compare the ID and full URL before treating a familiar title as a new job. A title can change on the same posting. A disappearance followed by a return can be temporary board behavior; the saved three-day cohort has 13 such returns.

Keep the employer/board with the ID. BambooHR ID `214` appears on unrelated employers' jobs. Some Workday `RawJobId` values are labels such as `Regular`, so check the requisition in the URL. A title-embedded requisition label can also change while the posting UUID stays fixed. [Evidence: F01, F02, F05](ats-behavior-analysis.md#ids-and-repost-detection).

Keep URL parameters until you know their purpose. `gh_jid` can identify the job. Group location variants for review, but retain each country and its terms. Huge's US and Canada roles have separate IDs, pay ranges, and currencies. Similar titles do not establish one opening. [Evidence: F07](ats-behavior-analysis.md#duplicate-behavior).

## Confirm that the link reaches the job

Open the final page. Check the employer, role, location, job content, and application route. An HTTP 200 response can be a generic board, error page, or empty shell. Saved checks found this on Greenhouse, Ashby, and iCIMS URLs.

A blocked page or rate limit is not proof of closure. The saved checks include Greenhouse detail pages returning 406 while the board API still listed the ID. Keep that result unresolved until you have enough evidence. [Evidence: F06](ats-behavior-analysis.md#urlclosure-behavior).

## Expand the work you search for

Search for a responsibility pattern, then inspect the role:

| Work pattern | Evidence-backed title examples | What to inspect |
| --- | --- | --- |
| Own information structure and its lifecycle | CX Knowledge Architect; Knowledge & Enablement Lead | Taxonomy, review, governance, maintenance, search and content ownership |
| Help developers use a product | Senior Content Engineer; Technical Content Engineer | API/SDK guides, runnable examples, architecture guidance; coding requirements |
| Make operational knowledge usable | Enablement Operations Manager; Knowledge Base Program Manager | Publishing standards, support workflows, discoverability, content quality |
| Maintain knowledge for AI and people | Director, AI Content Strategy; CX Knowledge Base & Conversational AI Manager | Content models, conversation evaluation, trusted source content and review processes |
| Combine education with product documentation | Customer Enablement Associate | User guides, release notes, curriculum; required live training and level |

These are starting points, not a fixed list. Follow the objects and results: what content does the role own, who uses it, how is it maintained, and how is success measured? Look across Marketing, Customer Experience, Support, Strategy, Risk Operations, and GTM Enablement. All occur in the saved examples. [Evidence: F10](ats-behavior-analysis.md#documentation-role-discovery).

Do not exclude “engineer” automatically. Healthie's Senior Content Engineer accepts a technical-writing background and owns developer content. But “knowledge” and “enablement” can describe software or research roles. GHX's Developer Platform & AI Enablement role requires software development and infrastructure work. Inspect the main work product and the experience gate.

## Read required and preferred sections separately

Camunda places software engineering under “Nice-to-haves.” LlamaIndex's AI Content Engineer places software engineering under “Required Qualifications” and requires production Python. Commvault accepts several alternative backgrounds, including technical writing.

For each concern, copy the exact clause and its heading. Mark it required, preferred, bonus, an alternative, or unclear. Do not let one “preferred” word change a different required clause. If a feed loses headings or lists, read the full employer page. [Evidence: qualification analysis](ats-behavior-analysis.md#required-vs-preferred-qualification-behavior).

## Verify US-remote eligibility from role text

Read the role-specific arrangement, country, state exclusions, work authorization, and any location alternatives together. A “Remote” label does not establish access from all US states.

The saved evidence includes a Philippines-remote role incorrectly marked US-eligible, a hybrid-or-remote alternative reduced to Hybrid, and a remote role that excludes Hawaii in its description. General company policy can list all arrangements without assigning one to the role. [Evidence: F08](ats-behavior-analysis.md#remotelocation-behavior).

If the record contains only a title or short card, keep eligibility unknown. All current BambooHR descriptions and nearly all routine Workday descriptions are title-only in this feed. This is a collection limit, not evidence that the employer has no full description.

## Read the full pay statement

Check currency, period, location, and whether the figure is base salary, total target cash, or another component. The current parser labels a Huge Canada range as USD. It misses Camunda's decimal-formatted ranges, which include variable target where applicable.

Blank detected salary does not establish that pay is absent from the posting. A detected range does not establish base salary. Keep country-specific ranges separate and leave unsupported amounts unknown. [Evidence: F09](ats-behavior-analysis.md#compensation-behavior).

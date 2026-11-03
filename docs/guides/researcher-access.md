# Researcher workspaces on the shared platform

The operator creates accounts and assigns the `researcher` or `study-researcher` realm role. Both roles have the same study boundary. Only `admin` has a global view or platform administration rights.

## Study workflow

Researchers can create studies. Creation grants the creator a `lead` membership, management permission and export permission. If creating the membership fails, the new study is removed before graph synchronization.

Leads can configure their studies and add existing researcher accounts through the Access tab. They cannot create accounts, change realm roles, promote or remove leads, or grant export access beyond their own scope. The operator can manage all memberships. Leads cannot access another person's other study memberships or participant account directory.

Collaborator permissions are independent:

- Membership permits viewing study data.
- `canManage: true` permits changing study settings, questionnaire assignments, enrollment codes, study-owned questionnaires/cues, and notification campaigns.
- `scope: export` permits downloads. It does not grant management permission.
- `role: lead` permits management and collaborator administration. Export still requires export scope.

Existing memberships without `canManage` are view-only unless their role is `lead`. The operator can explicitly enable management through the Access panel.

Closing recruitment sets `recruitmentOpen: false`. Enrollment and study switching via codes are refused before consuming a redemption. Existing participants and records remain active. Reopening recruitment restores code enrollment. Deletion, default-study selection and identity configuration remain operator-only.

## Resources and central data

All studies, questionnaires, cues, participants, responses, habits, donations, audio, and graph projections continue to use the existing central databases and storage. No database or service is created per researcher. Admin lists remain global; researcher lists are filtered by study memberships.

New questionnaires and cues created by researchers carry a `studyId`. Select the target study in the Questionnaires or Cue Pools page. Existing resources without a `studyId` remain shared templates. Researchers can read these and copy questionnaires into their own study before editing. They cannot change shared templates or resources belonging to another study.

Participant detail views and researcher exports also stay within the authorized study after a participant switches studies. Legacy questionnaire responses are attributed through their original scheduled windows or donation records. Rows with no reliable study attribution remain available to the operator, and are excluded from researcher exports. New scheduled and donation responses retain their study attribution.

Questionnaire assignments and donation questionnaire settings reject resources owned by another study. Cue sampling uses shared cues plus the participant's own study cues. Public questionnaire endpoints restrict private definitions and responses to the participant's study.

## Infrastructure access

Researcher accounts receive no Grafana, Neo4j, LightRAG, Mongo Express, RedisInsight, queue dashboard, backup, or platform settings access.

Production infrastructure routes retain their existing operator SSO/password gates. Grafana now requires the admin realm role both in its OAuth mapping (strict) and at the public Traefik route, so a previous Grafana session cannot bypass the role gate. LightRAG retains its separate admin login and server API key; the local stack now enables its admin login too. Do not distribute infrastructure passwords or service API keys to researchers.

Apply compose changes when deploying; saving the files does not change a running Grafana/Traefik/LightRAG instance. Rebuild app/admin for the application changes. This change does not modify a running deployment or revoke separately issued infrastructure credentials.

## Local verification

1. Run `make dev` to rebuild the local stack.
2. As operator, create two researcher accounts. Neither account should hold the admin role.
3. As the first researcher, create a study, create a private questionnaire and cue, and copy a library questionnaire into it.
4. As the other researcher, verify that those private resources and study data are inaccessible, including direct API URLs.
5. As operator, verify both researchers' studies and resources in the central lists.
6. Add a collaborator with viewing/export permission but no management permission. Confirm that downloads work but changes are refused. Enable management and repeat.
7. Close recruitment and try a code; reopening should allow the code again without a redemption having been consumed while closed.
8. Try the production Grafana URL with a researcher-only account; access should be refused. Infrastructure credentials are separate from the researcher login.

Automated regression tests include `app/tests/integration/researcherWorkspace.test.js`, the study access/role tests, participant questionnaire routes, and admin interface tests.

## Local test researcher

The [environment configuration guide](environment-configuration.md#local-test-logins) documents the matching test-account sections and inactive settings.

Set `HHH_RESEARCHER_USER` and `HHH_RESEARCHER_PASSWORD` in the ignored local `.env`. `make dev` provisions this account after starting the services. Use `make seed-researcher` to provision or reset only the test researcher without rebuilding anything. Blank credentials skip provisioning.

The script only connects to local Keycloak (`LOCAL_KEYCLOAK_URL`, default `http://localhost:8080`). It grants the researcher role, refuses operator/identity roles, and does not assign study memberships. The researcher can create their own study; the operator can assign existing studies. It refuses to overwrite an unrelated existing account with the same username. Passwords and access tokens are never printed.

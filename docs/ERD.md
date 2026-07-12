# Entity Relationship Diagram

```mermaid
erDiagram
    FACILITIES ||--o{ USERS : contains
    FACILITIES ||--o{ INVENTORY_RECORDS : publishes
    USERS ||--o{ SESSIONS : owns
    USERS ||--o{ BLOOD_REQUESTS : creates
    FACILITIES ||--o{ BLOOD_REQUESTS : receives
    BLOOD_REQUESTS ||--o{ REQUEST_EVENTS : records
    BLOOD_REQUESTS ||--o{ REQUEST_NOTES : contains
    BLOOD_REQUESTS ||--o{ REQUEST_DOCUMENTS : attaches
    USERS ||--o| DONOR_PROFILES : has
    BLOOD_REQUESTS ||--o{ OUTREACH_CAMPAIGNS : triggers
    OUTREACH_CAMPAIGNS ||--o{ CAMPAIGN_RECIPIENTS : targets
    USERS ||--o{ CAMPAIGN_RECIPIENTS : receives
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_EVENTS : performs
    INVENTORY_RECORDS ||--o{ INVENTORY_ADJUSTMENTS : tracks

    FACILITIES {
      int id PK
      string name
      string district
      string verification_status
      boolean public_availability
    }
    USERS {
      int id PK
      string name
      string email
      string role
      int facility_id FK
    }
    INVENTORY_RECORDS {
      int id PK
      int facility_id FK
      string blood_group
      string rh_factor
      string component
      int available_quantity
      datetime last_updated
    }
    BLOOD_REQUESTS {
      int id PK
      string reference
      int requester_id FK
      int facility_id FK
      string blood_group
      string component
      string status
      datetime needed_by
    }
    DONOR_PROFILES {
      int id PK
      int user_id FK
      string self_reported_group
      string district
      string availability
      boolean outreach_consent
    }
    OUTREACH_CAMPAIGNS {
      int id PK
      int request_id FK
      int facility_id FK
      string status
      datetime expires_at
    }
    AUDIT_EVENTS {
      int id PK
      int actor_user_id FK
      string action
      string entity_type
      string entity_id
      datetime created_at
    }
```

## Data integrity rules

- `users.email` is unique.
- An inventory record is unique for each facility, group, Rh factor, and component combination.
- A request reference is unique and human readable.
- A donor has a maximum of one donor profile.
- A campaign recipient can only appear once within a campaign.
- Foreign-key constraints protect linked workflow records from orphaning.

# Firestore Setup Instructions

## Firebase Rules
The `firestore.rules` file has been updated to support financial tracking and clinic settings. Deploy it to Firebase:

```bash
firebase deploy --only firestore:rules
```

Or upload it through the Firebase Console:
1. Go to Firebase Console → Firestore Database → Rules
2. Copy the contents from `firestore.rules`
3. Click "Publish"

## Required Firestore Indexes

The financials queries require a composite index. Firebase will show you a link to create it automatically when you run the query for the first time, or you can create it manually:

### Index for Financials Query

**Collection:** `artifacts/{appId}/public/data/queue`

**Fields to index:**
- `status` (Ascending)
- `completedAt` (Descending)

**Query scope:** Collection

**How to create:**
1. When you first run a financials query, Firebase will show an error with a link to create the index
2. Click the link to auto-create it
3. OR manually create it:
   - Go to Firebase Console → Firestore Database → Indexes
   - Click "Create Index"
   - Collection ID: Enter your appId path: `artifacts/{yourAppId}/public/data/queue`
   - Add fields:
     - Field: `status`, Order: Ascending
     - Field: `completedAt`, Order: Descending
   - Click "Create"

## Data Structure

### Queue Document (Financial Tracking)
```javascript
{
  name: "Patient Name",
  mobile: "1234567890",
  issue: "Reason for visit",
  status: "seen",  // Must be "seen" for financial tracking
  fee: 500.00,  // Consultation fee (number)
  completedAt: Timestamp,  // When patient was seen
  notes: "Doctor notes",
  joinedAt: Timestamp,
  // ... other fields
}
```

### Clinic Settings Document
**Path:** `artifacts/{appId}/public/data/clinicSettings/settings`
```javascript
{
  latitude: 12.94320783333333,
  longitude: 80.15839316666666,
  maxDistanceMeters: 100000,
  updatedAt: Timestamp
}
```

## Rules Summary

1. **Queue Collection:**
   - ✅ All authenticated users can READ (for patients to see their queue position)
   - ✅ All authenticated users can CREATE (for patients to join queue)
   - ✅ Only admin can UPDATE (to add fee, mark as seen/completed)
   - ✅ Only admin can DELETE

2. **Clinic Settings:**
   - ✅ All authenticated users can READ (location check for patients)
   - ✅ Only admin can WRITE (to update location coordinates)

3. **Financial Queries:**
   - The financials tab queries queue documents where `status == "seen"` and `completedAt` is within a date range
   - These queries require the composite index mentioned above

## Security Notes

- Admin email is hardcoded as: `prajansanjayko@gmail.com`
- Change this in both the rules file and the `index.html` file (ADMIN_EMAIL constant) if needed
- All financial data (fees) are stored in the queue documents, allowing historical financial tracking


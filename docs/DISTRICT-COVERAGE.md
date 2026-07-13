# Nepal District Coverage

Raktakosh provides a countrywide district directory covering all 77 districts of Nepal. The directory is used in the public availability search, donor registration, and private blood-request form.

## What countrywide coverage means

- A user can select any Nepal district when searching for facility-reported availability.
- Donors must select a valid Nepal district when creating their profile.
- Requesters must select a valid Nepal district when submitting a private coordination request.
- The API validates district values so unsupported or misspelled values are not stored or used as a filter.

## Availability data

Selecting a district does not create or imply a verified blood-service facility in that district. Search results appear only after a verified facility has been added and has published public inventory data.

The development seed data currently contains example facilities and inventory in Morang. This is intentional demo data; it does not limit the district options available in the application.

## Maintaining the directory

The canonical list is maintained in `src/nepal-districts.ts`. Both the React client and Express API import that file, preventing the user interface and server validation from drifting apart.

When changing the directory:

1. Update `NEPAL_DISTRICTS` in `src/nepal-districts.ts`.
2. Run `npm test` to verify the directory count and validation.
3. Run `npm run build` to type-check and build the client.

The directory uses canonical English names because these values are persisted in the existing database fields. Any future Nepali labels can be added as display-only translations without changing stored district values.

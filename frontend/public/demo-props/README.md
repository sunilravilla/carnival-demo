# Demo props for the Carnival "Show this" picker

Drop these JPEGs here before running the demo. Suggested ~600px wide each:

| filename | what to show |
|---|---|
| cozumel-ticket.jpg | A printed Cozumel snorkel excursion ticket with meet time/place visible |
| cucina-menu.jpg | A Cucina del Capitano dinner menu, English |
| wine-label.jpg | A wine bottle label (varietal + winery) |
| allergy-card.jpg | A Camp Ocean allergy card (kids' name + allergens) |
| keycard.jpg | A Carnival Sail & Sign card front |

If a file is missing, the strip in the UI still renders but the thumbnail
will appear faded (the `<img onError>` handler dims it).

The presenter clicks one → the frontend POSTs `{prop_id, prompt}` to
`/api/agent-show-prop` which runs Qwen Omni Vision over the image and
threads the result into the next agent turn.

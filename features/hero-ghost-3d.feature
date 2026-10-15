Feature: The hero shows the 3D ghost picture instead of the old 2D drawing
  Source art: hive/research/landing-art/ghost-receipts.png (1536 x 1024, 2 MB, RGBA). That file is a
  master, never served as is. Next to personal-finance.feature; same PR rules (tests first, red then green).

  Scenario: The picture is in the hero, in light and dark
    Given a visitor opens the home page at 390 and at 1280 pixels wide, in light and in dark mode
    Then the hero shows the 3D ghost picture next to the headline, as its one piece of art
    And the picture is fully visible, not cropped, and in light mode it does not sit as a black rectangle on a pale page: the dark corners of the source must blend into the page or be framed on purpose (a rounded dark card)
    And the headline, the plain line and the buttons stay readable on top or beside it in both modes

  Scenario: The old 2D hero drawing is gone
    Then the home page no longer contains the inline hero svg (class hero-art, its aria-label and its receipt drawing)
    And no css for the removed drawing is left behind, and no unused hero image file is shipped

  Scenario: The file is small, modern and has a fallback
    Then the page serves the picture as AVIF and WebP with a PNG or JPEG fallback, in a picture element
    And at the default width the browser fetches one file of 150 KB or less
    And no served variant is larger than the 1536 by 1024 source and the 2 MB master is not in the build output
    And srcset and sizes give at least a small, a medium and a large width, so a phone does not fetch the desktop file

  Scenario: The picture does not shift the page
    Then the img has explicit width and height that match the aspect ratio 3 to 2
    And the cumulative layout shift of the home page is 0 for the hero
    And the image is not lazy-loaded: no loading=lazy, and it has fetchpriority high or an equivalent preload, because it is the first thing seen

  Scenario: The alt text says what it shows
    Then the img has a non-empty alt that names the ghost, the receipts and the companies, for example "A friendly ghost feeding a long receipt into a machine that sorts the receipts into stacks for Amazon, Starbucks, Apple, Netflix and Spotify"
    And it is not "image", not a file name, and not the page title
    And the picture is not also marked aria-hidden, and there is no second description of it

  Scenario: The company logos in the picture are already disclosed
    Then every company logo visible in the picture is one the page already shows and names in its "names, logos and Plaid" notice
    And that notice is unchanged

  Scenario: Nothing new is loaded or sent
    Then the page adds no new host, script, tracker or font, and the image URL is on trickortreat.fi
    And the content security policy is unchanged
    And og:image, og:image:alt, og:title, twitter:card and the other share tags are unchanged, and the share image file is byte for byte the same

  Scenario: The rest of the page still works
    Then the playful headline, the plain line, "What it won't ask for", "Not investment advice", the theme button and the email signup are unchanged
    And the page still has one h1, and the existing site tests pass

  Scenario: The note "same purchases, new sort." is gone from every page
    Given the built site
    When every html page is read (index, about, 404, hello-hacker) with tags and attributes included
    Then the text "same purchases, new sort" does not appear, in any letter case and with or without the final full stop, in visible text, alt text, aria-labels, titles or meta tags
    And no test, stylesheet or script still expects it
    And the scenario fails if the text is put back on any one page

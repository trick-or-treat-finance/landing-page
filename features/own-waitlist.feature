Feature: The "be the first to know" form sends the email to our own list
  When the site is built with the address of our own API, leaving an email never touches a
  third party: the page makes no request until the visitor submits, then posts the address to
  our list and says plainly what happened. Built without that address the page is exactly what
  it was, so the form is flipped by configuration once the API is live and not before.

  Scenario: Built for our own list, the page makes no request until the visitor submits
    Given the site is built with the address of our own list
    When a visitor opens the page and presses "Leave your email"
    Then no request has gone to any other site
    And the page shows an email box, a button and nothing else is sent yet

  Scenario: Submitting posts the address once and says what will happen
    Given the site is built with the address of our own list
    When the visitor types "maya@example.com" and submits
    Then exactly one request goes to our list, with that address and where it was left
    And the page says we will email once, when it opens
    And the box is gone so it cannot be sent twice

  Scenario: Something that is not an address is not sent
    Given the site is built with the address of our own list
    When the visitor submits "nope"
    Then no request goes to our list
    And the page asks for a real address and keeps what they typed

  Scenario Outline: The list answers with a refusal or is unreachable
    Given the site is built with the address of our own list
    And the list answers <answer>
    When the visitor types "maya@example.com" and submits
    Then the page says <words>
    And the visitor can try again

    Examples:
      | answer              | words                          |
      | 429                 | to try again in a bit          |
      | 422                 | that is not a real address     |
      | 500                 | it could not reach us          |
      | nothing at all      | it could not reach us          |

  Scenario: A robot's hidden box is sent along and a person never sees it
    Given the site is built with the address of our own list
    When a visitor opens the form
    Then a hidden box named website is in the form, out of sight and out of the tab order

  Scenario: The fine print says we keep the address and email once
    Given the site is built with the address of our own list
    When a visitor reads the fine print about the email sign-up
    Then it says we email once when we launch
    And it no longer names a newsletter service

  Scenario: Built without that address nothing changes
    Given the site is built without the address of our own list
    When a visitor presses "Leave your email"
    Then the old sign-up loads and nothing is posted to our list

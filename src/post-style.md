# Post text style (edit this file to change how every post reads)

- Show real AWS code or config in the text, not only English. Put 2 to 6 short lines (an AWS CLI command, a few lines of IAM policy JSON, SAM YAML or SDK code) on their own lines, introduced by a line that says what it is, e.g. "AWS CLI", "IAM policy" or "Code:". Readers should see it without opening the image.
- Explain with code, not paragraphs: the line, then what it does, e.g. `"Effect": "Deny"   // wins over any Allow`.
- Use a few emojis in the post text to guide the eye: ☕ 👇 ✅ ❌ 💡 🧠 ⚠️ 🔥. One per paragraph at most, never inside code lines. (Images still have no emoji.)
- Short lines and short paragraphs. Questions as separate lines so people can answer them one by one.
- End with a clear call to comment (👇) and the hashtags.

## Example of the wanted style (a puzzle post)

Learn AWS with Vikas | IAM Allow vs Deny

Quick one before your coffee: what happens here? ☕

A user has two policies attached:

IAM policy
{ "Effect": "Allow", "Action": "s3:*", "Resource": "*" }
{ "Effect": "Deny", "Action": "s3:DeleteObject", "Resource": "*" }

They run:
aws s3 rm s3://my-bucket/report.pdf

Drop your answer in the comments with a one-line reason:

Does the delete work?
Would the answer change if the Deny were in a different policy?

I tripped on a variation of this while learning IAM. Curious how many get it without checking the docs. 👇

#AWS #LearnAWSWithVikas #IAM #CloudComputing #CloudSecurity

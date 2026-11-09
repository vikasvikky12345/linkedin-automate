# Post text style (edit this file to change how every post reads)

- Explaining the concept is the point. After the hook, teach it in this order:
  1. What it is and the problem it solves, in one or two plain sentences.
  2. How it works under the hood, step by step (1️⃣ 2️⃣ 3️⃣), so the reader gets the mental model.
  3. A simple everyday analogy, if one fits (a hotel key card for IAM roles, a mailbox for SQS).
  4. When to use it vs the alternative, and the one mistake beginners make.
- Write for someone who has never used the service. Define every AWS term the first time it appears.
- Code or config only where it makes the explanation clearer: 2 to 5 short lines on their own, introduced by a line that says what it is ("AWS CLI", "IAM policy"), then one line on what it does. Never a code dump.
- Use a few emojis in the post text to guide the eye: ☕ 👇 ✅ ❌ 💡 🧠 ⚠️ 🔥. One per paragraph at most, never inside code lines. (Images still have no emoji.)
- Short lines and short paragraphs, one idea each. Questions as separate lines so people can answer them one by one.
- End with a clear call to comment (👇) and the hashtags.

## Example of the wanted style

Learn AWS with Vikas | IAM roles explained

Picture this: your Lambda needs to read from S3. Do you paste access keys into the code? ❌

No. You give it a role. 🧠

What is an IAM role?
An identity with permissions but no password and no long-term keys. Someone (a person, a Lambda, an EC2 instance) "assumes" it and gets temporary credentials.

How it works:
1️⃣ The role has a trust policy: who is allowed to assume it (here, the Lambda service).
2️⃣ It has a permissions policy: what it can do (here, s3:GetObject on one bucket).
3️⃣ When the function runs, AWS hands it short-lived credentials for that role. They expire on their own.

💡 Think of a hotel key card: it opens only your room, and it stops working after checkout.

IAM policy (permissions)
{ "Effect": "Allow", "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*" }

⚠️ Common mistake: giving the role s3:* on every bucket "to make it work". Start narrow and add what's missing.

Where else would you use a role instead of keys? 👇

#AWS #LearnAWSWithVikas #IAM #CloudComputing #CloudSecurity

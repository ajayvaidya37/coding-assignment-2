const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());
let db = null;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
//initalizing database and server

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server started at localhost://3000/");
    });
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
};
initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  //console.log(authHeader);
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "AJAY_VAIDYA", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send(" Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user 
             (name,username,password,gender)
             VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
      await db.run(addUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "AJAY_VAIDYA");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserId);
  // console.log(userId.user_id);
  const getTweetsOfUser = `SELECT user.username as username,tweet.tweet as tweet,
  tweet.date_time as dateTime
   FROM user INNER JOIN tweet on user.user_id = tweet.user_id
   WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id})
   ORDER BY tweet.date_time DESC
   LIMIT 4;`;
  try {
    const tweetArray = await db.all(getTweetsOfUser);
    response.send(tweetArray);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getFollowingQuery = `
  SELECT name FROM user WHERE user_id IN
  (SELECT following_user_id
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}');`;
  const userFollowing = await db.all(getFollowingQuery);
  response.send(userFollowing);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getFollowersQuery = `SELECT name FROM user WHERE user_id IN
  (SELECT follower_user_id
    FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE user.username = '${username}'); `;
  const userFollowers = await db.all(getFollowersQuery);
  response.send(userFollowers);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const username = request.username;
  const { tweetId } = request.params;
  const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserId);
  const getTweetQuery = `SELECT tweet.tweet as tweet,
  SUM(like.like_id) as likes, SUM(reply.reply_id) as replies,
  tweet.date_time as dateTime
  FROM (tweet INNER JOIN reply ON tweet.user_id = reply.user_id ) as T 
  INNER JOIN like ON tweet.user_id = like.user_id
   WHERE (tweet.tweet_id = ${tweetId}
    AND tweet.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${user.user_id}));`;
  const tweet = await db.get(getTweetQuery);
  console.log(tweet);
  if (tweet.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweet);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
    const user = await db.get(getUserId);
    const getLikesInfoQuery = `SELECT user.username as username
    FROM (user INNER JOIN like ON user.user_id = like.user_id ) as T 
    INNER JOIN tweet ON tweet.tweet_id = T.tweet_id 
    WHERE (like.tweet_id = ${tweetId} AND tweet.user_id IN 
    (SELECT following_user_id FROM follower WHERE follower_user_id = ${user.user_id}));`;
    const usernameOfLikes = await db.all(getLikesInfoQuery);
    if (usernameOfLikes.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let usernameArray = [];
      for (let obj of usernameOfLikes) {
        const username = obj.username;
        usernameArray.push(username);
      }
      const responseObj = { likes: usernameArray };
      response.send(responseObj);
    }
  }
);
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
    const user = await db.get(getUserId);
    const getRepliesInfoQuery = `SELECT user.username as username,
    reply.reply as reply
    FROM (user INNER JOIN reply ON user.user_id = reply.user_id ) as T 
    INNER JOIN tweet ON tweet.tweet_id = reply.tweet_id 
    WHERE (reply.tweet_id = ${tweetId} AND tweet.user_id IN 
    (SELECT following_user_id FROM follower WHERE follower_user_id = ${user.user_id}));`;
    const usernamesOfReplies = await db.all(getRepliesInfoQuery);
    console.log(usernamesOfReplies);
    if (usernamesOfReplies.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const responseObj = { replies: usernamesOfReplies };
      response.send(responseObj);
    }
  }
);

//get the tweets of a user

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserId);
  const getTweetsOfAUser = `SELECT tweet.tweet as tweet,
  SUM(like.like_id) as likes, SUM(reply.reply_id) as replies,
  tweet.date_time as dateTime
  FROM (tweet LEFT JOIN reply ON tweet.user_id = reply.user_id ) as T 
  LEFT JOIN like ON tweet.user_id = like.user_id
   WHERE tweet.user_id = ${user.user_id}; `;
  const tweets = await db.all(getTweetsOfAUser);
  response.send(tweets);
});

//create a tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;
  const { tweet } = request.body;
  const user = await db.get(getUserId);
  const createTweetQuery = `INSERT INTO tweet (tweet,user_id)
  VALUES ('${tweet}',${user.user_id});`;
  const dbResponse = await db.run(createTweetQuery);
  console.log(dbResponse);
  response.send("Created a Tweet");
});

//delete a tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    console.log(typeof tweetId);
    const getUserId = `SELECT user_id
    FROM user WHERE username = '${username}';`;

    const user = await db.get(getUserId);
    const getTweetIdsOfUser = `SELECT tweet_id FROM tweet WHERE user_id = ${user.user_id};`;
    const tweetIds = await db.all(getTweetIdsOfUser);
    let tweetIdArray = [];
    for (let obj of tweetIds) {
      tweetIdArray.push(obj.tweet_id);
    }
    console.log(typeof tweetIdArray[1]);
    console.log(tweetIdArray.includes(parseInt(tweetId)));
    if (tweetIdArray.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `DELETE FROM tweet 
    WHERE (tweet_id IN (SELECT tweet_id FROM tweet WHERE user_id = ${user.user_id})
    AND tweet_id = ${tweetId});`;
      const dbResponse = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;

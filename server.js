import 'dotenv/config'
import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'pg';
const { Client } = pkg;

const app = express();

const port = process.env.SERVERPORT;

const client = new Client({
    connectionString: process.env.CONNECTIONSTRING,
    ssl: {
        rejectUnauthorized: false,
    },
})


await client.connect();
await client.query(`
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    phoneNumber VARCHAR (255) NULL,
    email VARCHAR (255) NULL,
    linkedId INT NULL REFERENCES contacts (id),
    linkPrecedence VARCHAR (255) CHECK (linkPrecedence IN ('secondary', 'primary')),
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deletedAt TIMESTAMP NULL
  );
`)

app.listen(port, () => {
    console.log(`Server Running on Port ${port}.`);
});


app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json());

app.post("/identify", identify);

async function identify(req, res) {
    const { email, phone } = req.body;
    var primaryId, emails, phoneNumbers, secondaryContactIds;

    var queryResult = await client.query(`SELECT * FROM contacts WHERE phonenumber = $1 OR email = $2`, [phone ? phone : "", email ? email : ""]);
    var queryData = queryResult.rows;

    if (queryData.length > 0) {
        var primaryRows = queryData.filter((row) => row.linkprecedence == 'primary');
        primaryId = primaryRows[0].id
        var currentQuery = queryData.filter((row) => { if (row.email == email && row.phonenumber == phone) { return row } })
        if (currentQuery.length == 0) {
            await client.query(`INSERT INTO contacts (phonenumber, email, linkedid, linkPrecedence) VALUES ($1, $2, $3, 'secondary') RETURNING *`, [phone, email, primaryId]);
        }

        if (primaryRows.length > 1) {
            for (let index = 1; index < primaryRows.length; index++) {
                await client.query(`UPDATE contacts SET linkedid = $1, linkPrecedence = 'secondary' WHERE id = $2`, [primaryId, primaryRows[index].id]);
            }
        }

    } else {
        await client.query(`INSERT INTO contacts (phonenumber, email, linkedid, linkPrecedence) VALUES ($1, $2, NULL, 'primary') RETURNING *`, [phone, email]);
    }

    queryResult = await client.query(`SELECT * FROM contacts WHERE phonenumber = $1 OR email = $2`, [phone ? phone : "", email ? email : ""]);
    queryData = queryResult.rows;
    emails = queryData.map((row) => row.email);
    phoneNumbers = queryData.map((row) => row.phonenumber);
    secondaryContactIds = queryData.map((row) => { if (row.linkprecedence != 'primary') { return row.id } });


    const returnObject = {
        "contact": {
            "primaryContatctId": primaryId,
            "emails": [...new Set(emails)],
            "phoneNumbers": [...new Set(phoneNumbers)],
            "secondaryContactIds": secondaryContactIds.filter(element => typeof element === 'number')
        }
    }

    res.status(200)
        .json(returnObject)
}



const faker = require('faker');
const fs = require('fs');

var users = [];

for( var i=0; i<100; i++) {
    var fname = faker.name.firstName();
    var lname = faker.name.lastName();
    var name = fname + " " + lname;
    var email = faker.internet.exampleEmail(fname, lname);
    var userId = faker.internet.userName(fname, lname);
    var user = { "userId": userId, "userName": name, "email": email }
    users.push(user);
}

fs.writeFileSync('users.json', JSON.stringify(users,null,4));

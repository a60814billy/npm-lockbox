# npm-lockbox

## **Active Development In Progress**

Manage and restrict npm dependencies with specific versions or dates.

## Introduction

When maintaining some legacy projects, dependency issues often arise. 
Ideally, we'd like to keep the dependencies at the version they were when the project was created. 
However, npm automatically resolves to the latest version. 

The purpose of `npm-lockbox` is to address this issue. 
It allows you to specify a date, directing npm to only download dependency versions available up to that date.
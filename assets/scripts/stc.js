// if (target == "#Saddad") {
//   $.get(
//     "/Payment/GetSadadNumber",
//     {
//       UserId: "@Model.UserId",
//       type: "@Model.EntityType",
//       contractId: "@Model.ContractId",
//       Price: "@Model.FinalPrice",
//     },
//     function (res) {
//       var SADADtext = $(".SADADNote")
//         .html()
//         .replace("sadadNumber", "<b>" + res.toString() + "</b>")
//         .replace("InvoiceCode", "<b>" + "@Model.SADAD_InvoiceCode" + "</b>");
//       $(".SADADNote").html(SADADtext);
//       $(".SADADNote").removeAttr("hidden");
//     }
//   );
// }

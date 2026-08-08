let lang = localStorage.getItem("lang") ?? "ar";
var wpwlOptions = {
  applePay: {
    supportedNetworks: ["mada", "masterCard", "visa"],
  },

  iframeStyles: {
    "card-number-placeholder": {
      "font-family": "CoconNextArabic0",
    },
    "cvv-placeholder": {
      "font-family": "CoconNextArabic0",
    },
  },
  style: "card",
  paymentTarget: "_top",
  locale: lang,
  onReady: function () {
    // $(".wpwl-brand").css("display", "none");

    if (wpwlOptions.locale == "ar") {
      $(".wpwl-group").css("direction", "rtl");
      $(".wpwl-control-cardNumber").css({
        direction: "ltr",
        "text-align": "right",
      });
      //$(".wpwl-brand-card").css('left', '200px');
    }
  },

  onDetectBrand: function (brands) {
    $(".wpwl-brand").css("display", "block");
  },
};

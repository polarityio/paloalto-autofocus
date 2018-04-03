'use strict';

polarity.export = PolarityComponent.extend({

  details: Ember.computed.alias('block.data.details.body'),

    summaryTags: Ember.computed('details.tags', function(){
        let summaryTags = [];

        if(this.get('details.total')){
            summaryTags.push("Total number of hits: " + this.get('details.total'));
        }

        return summaryTags;
    }),

    allTags: Ember.computed('details', function(){
       let tags = Ember.A();
       this.get('details.hits').forEach(function(item){
           if(Array.isArray(item._source.tag)){
               item._source.tag.forEach(function(tag){
                   tags.push(tag);
               })
           }
       });

       return tags;
   }),

   otherData: Ember.computed('details', function(){
      let data = Ember.A();
      this.get('details.hits').forEach(function(item){
          data.push("FileType: " + item._source.filetype);
      });

      return data;
  })
});
